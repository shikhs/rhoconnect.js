(function($) {

    function publicInterface() {
        return {
            SyncNotify: SyncNotify
        };
    }

    var rho = RhoSync.rho;

    const action = {
        'none': 0,
        'delete': 1,
        'update': 2,
        'create': 3
    };

    function SyncNotification(url, params, removeAfterFire){
        this.url = url || '';
        this.params = params || '';
        this.removeAfterFire = removeAfterFire || false;
        if (url) {
            url = __canonizeRhoUrl(url);
        }

        this.toString = function() {
            //TODO: to implement
        }
    }

    function SyncNotify(engine) {

        var LOG = new rho.Logger('SyncNotify');

        var srcIDAndObject = {};
        var singleObjectSrcName = '';
        var singleObjectID = '';
        var hashCreateObjectErrors = {};
        var searchNotification = null;
        var syncNotifications = {};
        var allNotification = null;
        var emptyNotify = SyncNotification();
        var /*ISyncStatusListener*/ syncStatusListener = null;
        var enableReporting = false;
        var enableReportingGlobal = true;
        var strNotifyBody = "";
        var hashSrcObjectCount = {};


        SyncNotify.objectNotifyUrl = '';
        this.__defineGetter__('objectNotifyUrl', function() {
            return SyncNotify.objectNotifyUrl;
        });

        function addObjectNotify(source, objectId) {
            if ("string" == typeof source) { // if source by name
                singleObjectSrcName = source;
                singleObjectID = objectId.match(/^\{/) ? objectId.substring(1, objectId.length-2) : objectId ;
            } else { // if source by id or by reference
                var srcId = ("number" == typeof source) ? source : /*then it is an object*/ source.id;
                if (srcId) {
                    var hashObject = srcIDAndObject[srcId];
                    if (hashObject) {
                        hashObject = {};
                        srcIDAndObject[srcId] = hashObject;
                    }
                    hashObject[objectId] = action.none;
                }
            }
        }

        function cleanObjectNotifications() {
            singleObjectSrcName = "";
            singleObjectID = "";
            srcIDAndObject = {};
        }

        function cleanCreateObjectErrors() {
            hashCreateObjectErrors = {};
        }

        function processSingleObject() {
            if (!singleObjectSrcName) return;

            var src = engine.sources[singleObjectSrcName];
            if (src) {
                addObjectNotify(src,singleObjectID);
            }
            singleObjectSrcName = "";
            singleObjectID = "";
        }

         function fireObjectsNotification() {
            var strBody = "";
            var strUrl = "";

            if (!this.objectNotifyUrl) return;

            strUrl = __resolveUrl(this.objectNotifyUrl);

            $.each(srcIDAndObject, function(nSrcID, hashObject){
                $.each(hashObject, function(strObject, nNotifyType){

                    if (nNotifyType == action.none) return;

                    if (strBody) {
                        strBody += "&rho_callback=1&";
                    }

                    if (nNotifyType == action['delete']) {
                        strBody += "deleted[][object]=" + strObject;
                        strBody += "&deleted[][source_id]=" + nSrcID;
                    } else if (nNotifyType == action.update) {
                        strBody += "updated[][object]=" + strObject;
                        strBody += "&updated[][source_id]=" + nSrcID;
                    } else if (nNotifyType == action.create) {
                        strBody += "created[][object]=" + strObject;
                        strBody += "&created[][source_id]=" + nSrcID;
                    }

                    hashObject[strObject] = action.none;
                });
            });

            if (!strBody) return;
            callNotify(new SyncNotification(strUrl,"",false), strBody);
        }

         function onObjectChanged(srcId, objectId, type) {
            processSingleObject();

            var hashObject = srcIDAndObject[srcId];
            if (!hashObject) return;

            if(objectId in hashObject) {
                hashObject[objectId] = type;
            }
        }

        function addCreateObjectError(srcId, objectId, error) {
            var hashErrors = hashCreateObjectErrors.get(srcId);
            if ( hashErrors == null ) {
                hashErrors = {};
                hashCreateObjectErrors[srcId] = hashErrors;
            }
            hashErrors[objectId] = error;
        }

        function makeCreateObjectErrorBody(nSrcID) {
            var hashErrors = hashCreateObjectErrors[nSrcID];
            if (!hashErrors) return "";

            var strBody = "";
            $.each(srcIDAndObject, function(strObject, strError) {
                strBody += "&create_error[][object]=" + strObject;
                strBody += "&create_error[][error_message]=" + strError;
            });
            return strBody;
        }

         function onSyncSourceEnd(nSrc, sources) {
            var src = sources[nSrc];

            if (engine.getState() == engine.states.stop && src.errCode != rho.errors.ERR_NONE) {
                var pSN = getSyncNotifyBySrc(src);
                if (pSN != null) {
                    fireSyncNotification(src, true, src.errCode, "");
                } else {
                    fireAllSyncNotifications(true, src.errCode, src.error, "");
                }
            }
            else
                fireSyncNotification(src, true, src.errCode, "");

            cleanCreateObjectErrors();
        }

        function setSyncNotification(srcId, notification) {
            LOG.info("Set notification. Source ID: " +srcId +";" +(notification ? notification.toString() : ""));
            if (srcId == -1) {
                allNotification = notification;
            } else {
                syncNotifications[srcId] = notification;
            }
        }

        function setSearchNotification(url, params) {
            LOG.info( "Set search notification. Url: " +url +"; Params: " +params );
            var fullUrl = __resolveUrl(url);
            if (fullUrl) {
                searchNotification = new SyncNotification(fullUrl, params, true);
                LOG.info( "Done Set search notification. Url :" +fullUrl +"; Params: " +params );
            }
        }

        function setSyncStatusListener(listener) {
                syncStatusListener = listener;
        }

        function reportSyncStatus(status, errCode, details) {
            if (syncStatusListener != null
                    && (isReportingEnabled() || errCode == rho.errors.ERR_SYNCVERSION)) {
                if (errCode == rho.errors.ERR_SYNCVERSION) {
                    status = __getErrorText(errCode);
                } else {
                    details = details || __getErrorText(errCode);
                    status += (details ? __getMessageText("details")+details : "");
                }
                LOG.info("Status: " +status);
                //syncStatusListener.reportStatus(status, errCode); //TODO: to implement statusListener
            }
        }

/*
        void fireBulkSyncNotification( boolean bFinish, String status, String partition, int nErrCode )
        {
            if ( getSync().getState() == SyncEngine.esExit )
                return;

            if( nErrCode != RhoAppAdapter.ERR_NONE)
            {
                String strMessage = RhoAppAdapter.getMessageText("sync_failed_for") + "bulk.";
                reportSyncStatus(strMessage,nErrCode,"");
            }

            String strParams = "";
            strParams += "partition=" + partition;
            strParams += "&bulk_status="+status;
            strParams += "&sync_type=bulk";

            doFireSyncNotification( null, bFinish, nErrCode, "", strParams, "" );
        }
*/

        function fireAllSyncNotifications(isFinish, errCode, error, serverError ) {
            if (engine.getState() == engine.states.exit) return;

            if(errCode != rho.errors.ERR_NONE) {
                if (!engine.isSearch()) {
                    var strMessage = __getMessageText("sync_failed_for") + "all.";
                    reportSyncStatus(strMessage,errCode,error);
                }
            }
            var sn = getSyncNotifyBySrc(null);
            if (sn) {
                doFireSyncNotification(null, isFinish, errCode, error, "", serverError);
            }
        }

        function fireSyncNotification(src, isFinish, errCode, message ) {
            if (engine.getState() == engine.states.exit) return;

            if (message || errCode != rho.errors.ERR_NONE) {
                if (!engine.isSearch()) {
                    if (src != null && !message)
                        message = __getMessageText("sync_failed_for") + src.getName() + ".";

                    reportSyncStatus(message, errCode, src != null ? src.error : "");
                }
            }
            doFireSyncNotification(src, isFinish, errCode, "", "", "" );
        }

        function getSyncNotifyBySrc(src) {
            var sn = null; // sync notification
            if (engine.isSearch()) {
                sn = searchNotification;
            } else {
                if (src != null) sn = syncNotifications[src.id];
                if (sn == null) sn = allNotification;
            }
            if (sn == null && !engine.isNoThreadedMode()) return null;
            return sn != null ? sn : emptyNotify;
        }

        function doFireSyncNotification(src, isFinish, errCode, error, params, serverError) {
            if (engine.isStopedByUser()) return;

            try {
                var pSN = null;

                var strBody = "";
                var bRemoveAfterFire = isFinish;
                {
                    pSN = getSyncNotifyBySrc(src);
                    if (!pSN) return;

                    strBody = "";

                    if (src) {
                        strBody += "total_count=" + src.totalCount;
                        strBody += "&processed_count=" + src.curPageCount;
                        strBody += "&processed_objects_count=" + getLastSyncObjectCount(src.id);
                        strBody += "&cumulative_count=" + src.serverObjectsCount;
                        strBody += "&source_id=" + src.id;
                        strBody += "&source_name=" + src.getName();
                    }

                    strBody += (strBody ? "&" : "") +(params || "sync_type=incremental");

                    strBody += "&status=";
                    if (isFinish) {
                        if (errCode == rho.errors.ERR_NONE) {
                            //if (engine.isSchemaChanged()) {
                            //    strBody += "schema_changed";
                            //} else {
                                strBody += (!src && !params) ? "complete" : "ok";
                            //}
                        } else {
                            if (engine.isStopedByUser()) {
                                errCode = rho.errors.ERR_CANCELBYUSER;
                            }

                            strBody += "error";
                            strBody += "&error_code=" + errCode;

                            if (error) {
                                strBody += "&error_message=" + __urlEncode(error);
                            } else if (src) {
                                strBody += "&error_message=" + __urlEncode(src.error);
                            }

                            if (serverError) {
                                strBody += "&" + serverError;
                            } else if (src && src.serverError) {
                                strBody += "&" + src.serverError;
                            }
                        }

                        if (src) {
                            strBody += makeCreateObjectErrorBody(src.id);
                        }
                    } else {
                        strBody += "in_progress";
                    }

                    strBody += "&rho_callback=1";
                    if (pSN.params) {
                        if (!pSN.params.match(/^&/)) {
                            strBody += "&";
                        }
                        strBody += pSN.params;
                    }

                    bRemoveAfterFire = bRemoveAfterFire && pSN.removeAfterFire;
                }
                if (bRemoveAfterFire) {
                    clearNotification(src);
                }
                LOG.info("Fire notification. Source: " +(src ? src.name : "") +"; " +pSN.toString());

                if (callNotify(pSN, strBody)) {
                    clearNotification(src);
                }
            } catch(exc) {
                LOG.error("Fire notification failed.", exc);
            }
        }

        function callNotify(oNotify, strBody) {
            if (engine.isNoThreadedMode()) {
                strNotifyBody = strBody;
                return false;
            }
            if (!oNotify.url) return true;

            //TODO: implement real notification here!
            //NetResponse resp = getNet().pushData( oNotify.m_strUrl, strBody, null );
            //if ( !resp.isOK() )
            //    LOG.error( "Fire object notification failed. Code: " + resp.getRespCode() + "; Error body: " + resp.getCharData() );
            //else
            //{
            //    String szData = resp.getCharData();
            //    return szData != null && szData.equals("stop");
            //}

            return true;
        }

        function clearNotification(src) {
            LOG.info("Clear notification. Source: " +(src ? src.name() : ""));
            if (engine.isSearch()) searchNotification = null;
            else syncNotifications[src.id] = null;
        }

        function clearSyncNotification(srcId) {
            LOG.info("Clear notification. Source ID: " +srcId);
            if (srcId == -1) allNotification = null; //Clear all
            else syncNotifications[srcId] = null;
        }

        function cleanLastSyncObjectCount() {
            hashSrcObjectCount = {};
        }

        function incLastSyncObjectCount(nSrcID) {
            var nCount = hashSrcObjectCount[nSrcID] || 0;
            nCount += 1;

            hashSrcObjectCount[nSrcID] = nCount;

            return nCount || 0;
        }

        function getLastSyncObjectCount(nSrcID) {
            return hashSrcObjectCount[nSrcID] || 0;
        }


        function callLoginCallback(oNotify, nErrCode, strMessage) {
            //try {
                if (engine.isStopedByUser())
                    return;

                var strBody = "error_code=" + nErrCode;

                strBody += "&error_message=" + __urlEncode(strMessage != null? strMessage : "");
                strBody += "&rho_callback=1";

                LOG.info("Login callback: " +oNotify.toString() +". Body: " +strBody);

                callNotify(oNotify, strBody);
            //} catch (Exception exc) {
            //    LOG.error("Call Login callback failed.", exc);
            //}
        }

        function isReportingEnabled() {
            return enableReporting && enableReportingGlobal;
        }

    }

    function __getErrorText(key) {
        //TODO: to implement
    }

    function __getMessageText(key) {
        //TODO: to implement
    }

    function __getHomeUrl() {
        //TODO: to implement
        return "";
    }
    function __isExternalUrl() {
        //TODO: to implement
        return false;
    }

    function __canonizeRhoUrl(url) {
        //TODO: to implement
/*
        var strUrl = url;
            if (!url)
                return __getHomeUrl();
            strUrl = strUrl.replace('\\', '/');
            if ( !strUrl.startsWith(getHomeUrl()) && !isExternalUrl(strUrl) )
                strUrl = FilePath.join(getHomeUrl(), strUrl);
        return strUrl;
*/
        return url;
    }

    function __resolveUrl(url) {
        return url;
    }

    function __urlEncode(param) {
    }

    $.extend(rho, {notify: publicInterface()});

})(jQuery);
