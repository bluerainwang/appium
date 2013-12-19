/*global beforeEach:true, afterEach:true, describe:true, it:true */
"use strict";

var wd = require('wd')
  , _ = require("underscore")
  , sauce = require("saucelabs")
  , sauceRest = null
  , path = require("path")
  , defaultHost = '127.0.0.1'
  , defaultPort = process.env.APPIUM_PORT || 4723
  , defaultIosVer = '7.0'
  , domain = require('domain')
  , defaultCaps = {
      browserName: ''
      , device: 'iPhone Simulator'
      , platform: 'Mac'
      , version: defaultIosVer
    };

if (process.env.SAUCE_ACCESS_KEY && process.env.SAUCE_USERNAME) {
  sauceRest = new sauce({
    username: process.env.SAUCE_USERNAME
    , password: process.env.SAUCE_ACCESS_KEY
  });
}

var driverBlock = function(tests, host, port, caps, extraCaps) {
  host = (typeof host === "undefined" || host === null) ? _.clone(defaultHost) : host;
  var onSauce = host.indexOf("saucelabs") !== -1 && sauceRest;
  port = (typeof port === "undefined" || port === null) ? _.clone(defaultPort) : port;
  caps = (typeof caps === "undefined" || caps === null) ? _.clone(defaultCaps) : caps;
  caps = _.extend(caps, typeof extraCaps === "undefined" ? {} : extraCaps);
  caps.launchTimeout = 15000;
  var driverHolder = {driver: null, sessionId: null};
  var expectConnError = extraCaps && extraCaps.expectConnError;

  beforeEach(function(done) {
    if (onSauce && this.currentTest) {
      caps.name = this.currentTest.parent.title + " " + this.currentTest.title;
    }

    driverHolder.driver = wd.remote(host, port);
    driverHolder.driver.init(caps, function(err, sessionId) {
      if (expectConnError && err) {
        driverHolder.connError = err;
        return done();
      } else if (err) {
        return done(err);
      }

      driverHolder.sessionId = sessionId;
      driverHolder.driver.setImplicitWaitTimeout(5000, done);
    });

  });

  afterEach(function(done) {
    var passed = false;
    if (this.currentTest) {
      passed = this.currentTest.state = 'passed';
    }
    driverHolder.driver.quit(function(err) {
      if (err && err.status && err.status.code != 6) {
        done(err);
      }
      if (onSauce) {
        sauceRest.updateJob(driverHolder.sessionId, {
          passed: passed
        }, function() {
          done();
        });
      } else {
        done();
      }
    });
  });

  tests(driverHolder);
};

var describeWithDriver = function(desc, tests, host, port, caps, extraCaps, timeout, onlyify) {
  var descFn;
  if (onlyify) {
    descFn = describe.only;
  } else {
    descFn = describe;
  }
  descFn(desc, function() {
    if (typeof timeout !== "undefined") {
      this.timeout(timeout);
    }
    driverBlock(tests, host, port, caps, extraCaps, onlyify);
  });
};

var describeForSafari = function() {
  var fn = function(desc, tests, host, port, extraCaps, onlyify) {
    var caps = {
      browserName: 'Safari'
      , app: 'safari'
      , device: 'iPhone Simulator'
      , platform: 'Mac'
      , version: process.env.IOS_VERSION || "6.1"
    };
    return describeWithDriver(desc, tests, host, port, caps, extraCaps, undefined, onlyify);
  };
  fn.only = function() {
    var a = arguments;
    return fn(a[0], a[1], a[2], a[3], a[4], true);
  };
  return fn;
};
describeForSafari.only = function() {
  return describeForSafari(true);
};

var describeForIWebView = function() {
  var fn = function(desc, tests, host, port, extraCaps, onlyify) {
    var caps = {
      browserName: ''
      , app: 'iwebview'
      , device: 'iPhone Simulator'
      , platform: 'Mac'
      , version: "7.0"
    };
    return describeWithDriver(desc, tests, host, port, caps, extraCaps, undefined, onlyify);
  };
  fn.only = function() {
    var a = arguments;
    return fn(a[0], a[1], a[2], a[3], a[4], true);
  };
  return fn;
};

var describeForChrome = function() {
  var fn = function(desc, tests, host, port, extraCaps, onlyify) {
    var caps = {
      app: 'chrome'
      , device: 'Android'
    };
    return describeWithDriver(desc, tests, host, port, caps, extraCaps, undefined, onlyify);
  };
  fn.only = function() {
    var a = arguments;
    return fn(a[0], a[1], a[2], a[3], a[4], true);
  };
  return fn;
};
describeForChrome.only = function() {
  return describeForChrome(true);
};

var describeForApp = function(app, device, appPackage, appActivity, appWaitActivity) {
  if (typeof device === "undefined") {
    device = "ios";
  }
  var browserName, appPath, realDevice;
  if (device === "ios") {
    realDevice = "iPhone Simulator";
    browserName = "iOS";
  } else if (device === "android") {
    browserName = realDevice = "Android";
  } else if (device === "selendroid") {
    browserName = realDevice = "Selendroid";
  } else if (device === "firefox" || device === "firefoxos") {
    browserName = realDevice = "Firefox";
  }
  if (/\//.exec(app) || /\./.exec(app)) {
    appPath = app;
  } else {
    if (device === "ios") {
      appPath = path.resolve(__dirname, "../../sample-code/apps/" + app + "/build/Release-iphonesimulator/" + app + ".app");
    } else if (device === "android" || device === "selendroid") {
      appPath = path.resolve(__dirname, "../../sample-code/apps/" + app + "/bin/" + app + "-debug.apk");
    } else {
      appPath = app;
    }
  }

  return function(desc, tests, host, port, caps, extraCaps) {
    if (typeof extraCaps === "undefined") {
      extraCaps = {};
    }
    var newExtraCaps = {
      app: appPath,
      browserName: browserName,
      device: realDevice
    };
    if (typeof appPackage !== "undefined") {
      newExtraCaps['app-package'] = appPackage;
      newExtraCaps['app-activity'] = appActivity;
      if (typeof appWaitActivity !== "undefined") {
        newExtraCaps['app-wait-activity'] = appWaitActivity;
      }
    }
    extraCaps = _.extend(extraCaps, newExtraCaps);
    return describeWithDriver(desc, tests, host, port, caps, extraCaps);
  };
};

var describeForSauce = function(appUrl, device) {
  return function(desc, tests, extraCaps, host, port) {
    device = device || 'iPhone Simulator';
    if (typeof process.env.SAUCE_USERNAME === "undefined" || typeof process.env.SAUCE_ACCESS_KEY === "undefined") {
      throw new Error("Need to set SAUCE_USERNAME and SAUCE_ACCESS_KEY");
    }
    host = host || 'http://' + process.env.SAUCE_USERNAME + ':' +
                   process.env.SAUCE_ACCESS_KEY + '@ondemand.saucelabs.com' +
                   ':80/wd/hub';
    port = undefined;
    var caps = {
      device: device
      , browserName: ""
      , app: appUrl
    };
    if (caps.device.toLowerCase().indexOf('android') !== -1) {
      caps.platform = "LINUX";
      caps.version = "4.2";
    } else {
      caps.version = caps.version || "6.1";
      caps.platform = caps.platform || "Mac 10.8";
    }

    return describeWithDriver(desc, tests, host, port, caps, extraCaps, 500000);
  };
};

module.exports.it = function(behavior, test) {
  it(behavior, function(done) {
    var d = domain.create();
    d.on('error', function(err) {
      done(err);
    });
    d.run(function() {
      test(done);
    });
  });
};

module.exports.block = driverBlock;
module.exports.describe = describeWithDriver;
module.exports.describeForApp = describeForApp;
module.exports.describeForSauce = describeForSauce;
module.exports.describeForSafari = describeForSafari;
module.exports.describeForIWebView = describeForIWebView;
module.exports.describeForChrome = describeForChrome;
