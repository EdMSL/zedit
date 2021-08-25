ngapp.service('automationService', function($rootScope, $timeout, interApiService, progressService, timerService) {
    let keepOpen;

    let buildScriptFunction = function(scriptCode) {
        try {
            return new Function('zedit', 'fh', scriptCode);
        } catch (e) {
            logger.error(`Exception parsing script: ${e.message}`);
        }
    };

    let getSelectedNodes = function(targetScope) {
        return function() {
            if (!targetScope.selectedNodes) return [];
            return targetScope.selectedNodes.map(node => ({
                handle: node.handle,
                element_type: node.element_type,
                column_values: node.column_values.slice(),
                class: node.class
            }));
        };
    };

    let getSelectedRecords = function(targetScope) {
        return function(sig) {
            if (!targetScope.selectedNodes) return [];
            return targetScope.selectedNodes.filter(node => {
                if (node.element_type !== xelib.etMainRecord) return;
                return !sig || xelib.Signature(node.handle) === sig;
            }).map(node => node.handle);
        };
    };

    let navigateToElement = function(targetScope) {
        return function(element, open) {
            xelib.OutsideHandleGroup(() => {
                try {
                    targetScope.navigateToElement(element, open);
                } catch (x) {
                    logger.error(`Failed to navigate to element, ${x.message}`);
                }
            });
        }
    };

    let setSearchResults = function(targetScope) {
        return function(results) {
            xelib.OutsideHandleGroup(() => {
                try {
                    targetScope.$root.$broadcast('searchResults', {
                        results,
                        scope: 'All files',
                        searchOptions: { nodes: [] }
                    });
                } catch (x) {
                    logger.error(`Failed to set search results, ${x.message}`);
                }
            });
        }
    };

    let showProgress = function(progress) {
        keepOpen = progress.determinate;
        progressService.showProgress(progress);
    };

    let buildZEditContext = function(targetScope) {
        return Object.deepAssign({
            NavigateToElement: navigateToElement(targetScope),
            GetSelectedNodes: getSelectedNodes(targetScope),
            GetSelectedRecords: getSelectedRecords(targetScope),
            SetSearchResults: setSearchResults(targetScope),
            progressService: { showProgress },
            log: logger.log,
            info: logger.info,
            warn: logger.warn,
            error: logger.error
        }, interApiService.getApi('zeditScripting'));
    };

    let executeScriptFn = function(scriptFn, zedit) {
        try {
            scriptFn(zedit, fh);
            let timeStr = timerService.getSecondsStr('script');
            logger.info(`Script completed in ${timeStr}`);
        } catch(e) {
            logger.error(`Exception running script: \r\n${e.stack}`);
        } finally {
            xelib.FreeHandleGroup();
            $rootScope.$broadcast('reloadGUI');
            let method = keepOpen ? 'allowClose' : 'hideProgress';
            progressService[method]();
        }
    };

    this.runScript = function(targetScope, scriptCode, scriptFilename) {
        let scriptFn = buildScriptFunction(scriptCode),
            zedit = buildZEditContext(targetScope);
        xelib.CreateHandleGroup();
        targetScope.$emit('executingScript', scriptFilename);
        timerService.start('script');
        showProgress({
            determinate: false,
            message: `Executing ${scriptFilename}...`
        });
        $timeout(() => executeScriptFn(scriptFn, zedit), 50);
    };
});
