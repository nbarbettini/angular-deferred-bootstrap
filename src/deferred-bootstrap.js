'use strict';

var isObject = angular.isObject,
  isFunction = angular.isFunction,
  isArray = angular.isArray,
  isString = angular.isString,
  forEach = angular.forEach,
  loadingClass = 'deferred-bootstrap-loading',
  errorClass = 'deferred-bootstrap-error',
  onLoadingShowCallback,
  onLoadingHideCallback,
  onErrorShowCallback,
  isLoading = true,
  loadingShown = false,
  loadingShownLongEnough,
  bodyElement,
  $q;

function onLoadingShowInternal() {
    loadingShown = true;
    return withPromise(onLoadingShowCallback).then(function () {
        bodyElement.addClass(loadingClass);
    });
}

function onLoadingHideInternal() {
    return loadingShownLongEnough.promise.then(function () {
        return withPromise(onLoadingHideCallback).then(function () {
            bodyElement.removeClass(loadingClass);
        });
    });
}

function onErrorShowInternal() {
    return onLoadingHideInternal().then(function () {
        return withPromise(onErrorShowCallback).then(function () {
            bodyElement.addClass(errorClass);
        });
    });
}

function isPromise(value) {
    return isObject(value) && isFunction(value.then);
}

// Ensures a promise around a function which may or may not actually return a promise
function withPromise(func) {
    var deferred = $q.defer();

    var funcResult;
    if (func && typeof (func) === "function")
        funcResult = func();

    if (!isPromise(funcResult))
        deferred.resolve(true);
    else
        funcResult.then(function (result) { deferred.resolve(result); });

    return deferred.promise;
}

function checkConfig(config) {
    if (!isObject(config)) {
        throw new Error('Bootstrap configuration must be an object.');
    }
    if (!isString(config.module)) {
        throw new Error('\'config.module\' must be a string.');
    }
    if (config.resolve && config.moduleResolves) {
        throw new Error('Bootstrap configuration can contain either \'resolve\' or \'moduleResolves\' but not both');
    }
    if (config.resolve) {
        if (!isObject(config.resolve)) {
            throw new Error('\'config.resolve\' must be an object.');
        }
    }
    if (config.bootstrapConfig) {
        if (!isObject(config.bootstrapConfig)) {
            throw new Error('\'config.bootstrapConfig\' must be an object.');
        }
    }
    if (config.moduleResolves) {
        if (!isArray(config.moduleResolves)) {
            throw new Error('\'config.moduleResolves\' must be an array.');
        }
    }

    forEach(config.moduleResolves, function (moduleResolve) {
        if (!moduleResolve.module) {
            throw new Error('A \'moduleResolve\' configuration item must contain a \'module\' name.');
        }

        if (!isObject(moduleResolve.resolve)) {
            throw new Error('\'moduleResolve.resolve\' must be an object.');
        }
    });

    if (angular.isDefined(config.onError) && !isFunction(config.onError)) {
        throw new Error('\'config.onError\' must be a function.');
    }
}
function provideRootElement(modules, element) {
    element = angular.element(element);
    modules.unshift(['$provide', function ($provide) {
        $provide.value('$rootElement', element);
    }]);
}

function createInjector(injectorModules, element) {
    var modules = ['ng'];
    if (isString(injectorModules)) {
        modules.push(injectorModules);
    } else if (isArray(injectorModules)) {
        modules = modules.concat(injectorModules);
    }
    provideRootElement(modules, element);
    return angular.injector(modules, element);
}

function doBootstrap(element, module, bootstrapConfig, beforeInitialize) {
    var deferred = $q.defer();

    angular.element(document).ready(function () {
        isLoading = false;
        if (loadingShown) {
            onLoadingHideInternal().then(function () {
                if (isFunction(beforeInitialize))
                    beforeInitialize();
                doBootstrapCore();
            });
        } else {
            loadingShownLongEnough.resolve(true);
            doBootstrapCore();
        }
    });

    function doBootstrapCore() {
        angular.bootstrap(element, [module], bootstrapConfig);
        deferred.resolve(true);
    }

    return $q.all([deferred, loadingShownLongEnough]);
}

function bootstrap(configParam) {
    var config = configParam || {},
    element = config.element,
    module = config.module,
    injectorModules = config.injectorModules || [],
    beforeLoading = config.beforeLoading || {},
    afterLoading = config.afterLoading || {},
    onLoadingShow = config.onLoadingShow || {},
    onLoadingHide = config.onLoadingHide || {},
    onErrorShow = config.onErrorShow || {},
    showLoadingThreshold = parseInt(config.showLoadingThreshold, 10) || 0,
    showLoadingMinDuration = parseInt(config.showLoadingMinDuration, 10) || 0,
    maxLoadingTimeout = parseInt(config.maxLoadingTimeout, 10) || 0,
    injector,
    promises = [],
    constants = [],
    bootstrapConfig = config.bootstrapConfig;

    checkConfig(config);
    injector = createInjector(injectorModules, element);
    $q = injector.get('$q');
    bodyElement = angular.element(document.body);

    onLoadingShowCallback = onLoadingShow;
    onLoadingHideCallback = onLoadingHide;
    onErrorShowCallback = onErrorShow;

    if (isFunction(beforeLoading))
        beforeLoading();
    isLoading = true;
    loadingShownLongEnough = $q.defer();

    // Timeout if the process takes longer than maxLoadingTimeout
    if (maxLoadingTimeout > 0) {
        setTimeout(function () {
            handleError(new Error('Timeout while loading'));
        }, maxLoadingTimeout);
    }

    // Show the loading screen if the process takes longer than showLoadingThreshold
    setTimeout(function () {
        if (isLoading) {
            onLoadingShowInternal();
        }

        // "Debounce" the loading screen to ensure a minimum length of time on the screen
        setTimeout(function () {
            loadingShownLongEnough.resolve(true);
        }, showLoadingMinDuration);
    }, showLoadingThreshold);

    if (config.moduleResolves) {
        forEach(config.moduleResolves, function (moduleResolve, index) {
            forEach(moduleResolve.resolve, function (resolveFunction, constantName) {
                callResolveFn(resolveFunction, constantName, config.moduleResolves[index].module);
            });
        });
    } else {
        forEach(config.resolve, function (resolveFunction, constantName) {
            callResolveFn(resolveFunction, constantName);
        });
    }

    return $q.all(promises).then(handleResults, handleError);


    function callResolveFn(resolveFunction, constantName, moduleName) {
        var result;

        constants.push({
            name: constantName,
            moduleName: moduleName || module
        });

        if (!isFunction(resolveFunction) && !isArray(resolveFunction)) {
            throw new Error('Resolve for \'' + constantName + '\' is not a valid dependency injection format.');
        }

        result = injector.instantiate(resolveFunction);

        if (isPromise(result)) {
            promises.push(result);
        } else {
            throw new Error('Resolve function for \'' + constantName + '\' must return a promise.');
        }
    }

    function handleResults(results) {
        forEach(results, function (value, index) {
            var result = value && value.data ? value.data : value,
              moduleName = constants[index].moduleName,
              constantName = constants[index].name;

            angular.module(moduleName).constant(constantName, result);
        });

        return doBootstrap(element, module, bootstrapConfig, afterLoading);
    }

    function handleError(error) {
        onErrorShowInternal();
        if (isFunction(config.onError)) {
            config.onError(error);
        }
    }
}

window.deferredBootstrapper = {
    bootstrap: bootstrap
};