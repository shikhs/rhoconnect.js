var firstName = null;
var secondName = null;

onLoad = (function($, Ext) {

    var APP_TAG = 'GMap-RhoConnect';

    // let's start here
    function doAppLaunch() {
        // iPhone emu doesn't support this PhoneGap event, so it just commented out.
        //document.addEventListener("deviceready", function(){

            initDeviceId();
            // UI initialization
            initGMap();
            //initLocationTest();
            loginRhoConnect("testUserToFailAuth", "userpass").done(function(){
                startSync();
            });
        //}, false);
    }

    var myUuid = null;
    var myName = null;

    function initDeviceId() {
        if ("undefined" != typeof device && (!myUuid || !myName)) {
            myUuid = device['uuid'];
            myName = device['name'];

            alert('Device uuid: ' + myUuid);
            alert('Device name: ' + myName);
        } else {
            myUuid = 'UNDEFINED';
            myName = 'UNDEFINED';
        }
    }

    var map = null;
    var infowindow = null;
    var markers = {};

    function initGMap() {
        var startHere = new google.maps.LatLng(37.317306, -121.947556);
        //var startHere = new google.maps.LatLng(60.02463,30.421507);
        var mapOpts = {
            zoom: 2,
            center: startHere,
            mapTypeId: google.maps.MapTypeId.ROADMAP
        };
        map = new google.maps.Map(document.getElementById("map_canvas"), mapOpts);
        infowindow = new google.maps.InfoWindow();
    }

    function initLocationTest() {
        alert('initLocationTest()');
        // Options: retrieve the location every 3 seconds
        //
        var watchID = navigator.geolocation.watchPosition(function(position){
            alert(  'Latitude: '  + position.coords.latitude + '\n' +
                    'Longitude: ' + position.coords.longitude + '\n');
        }, function(error){
            alert('code: '    + error.code    + '\n' +
                  'message: ' + error.message + '\n');
        }, { frequency: 3000, enableHighAccuracy: true });
    }


    var syncInterval = null;

    function startSync() {
        syncInterval = setInterval(doSync, 5 * 1000); // preform data sync every 5 seconds
    }

    // Perform data synchronization with the server
    function doSync(){
        if (!firstName && !secondName) return;

        $('#settings').css('display', 'none');
        $('#map_canvas').css('display', 'block');

        RhoConnect.syncAllSources().done(function(){
            //alert('data sync OK!');
            // set my location
            setMyLocation();
            // update locations
            updateLocations();
        }).fail(function(errCode, err){
            alert('Data sync error: ' +errCode);
            clearInterval(syncInterval);
            syncInterval = null;
        });
    }

    var locationError = false;

    function setMyLocation() {
        if ("undefined" == typeof navigator || null == navigator || locationError) return;

        navigator.geolocation.getCurrentPosition(function(position){
            var store = RhoConnect.dataAccessObjects()['Customer'];
            store.load(storeLoaded);

            function storeLoaded(records, operation, success) {
                var myRecord = null;

                for (var i=0; i<store.getCount(); i++) {
                    var record = store.getAt(i);
                    var city = record.get('city') || '';
                    var address = record.get('address') || '';
                    if (city == APP_TAG && address == myUuid) {
                        myRecord = record;
                    }
                }

                var lat = position.coords.latitude +'';
                var lng = position.coords.longitude +'';

                try {
                    if (!myRecord) {
                        myRecord = store.add({
                            city: APP_TAG,
                            address: myUuid,
                            first: firstName,
                            last: secondName,
                            lat: lat,
                            'long': lng
                         })[0];
                    } else {
                        myRecord.set('city', APP_TAG);
                        myRecord.set('address', myUuid);
                        myRecord.set('first', firstName);
                        myRecord.set('last', secondName);
                        myRecord.set('lat', lat);
                        myRecord.set('long', lng);
                    }
                    myRecord.save();
                    store.sync();
                } catch(ex) {
                    alert('Exception while updating my position: ' +ex);
                    //alert('Unable to read position via PhoneGap API');
                }
            }

        }, function(error){
            locationError = true;
            alert('Geolocation API error! \n' +
                    'code: '    + error.code    + '\n' +
                    'message: ' + error.message + '\n');
        }, {
            enableHighAccuracy: true,
            maximumAge:Infinity,
            timeout:3000
        });


    }

    function updateLocations() {
        var store = RhoConnect.dataAccessObjects()['Customer'];
        store.load(storeLoaded);

        function storeLoaded(records, operation, success) {
            for (var i=0; i<store.getCount(); i++) {
                var record = store.getAt(i);

                var city = record.get('city') || '';
                var address = record.get('address') || '';
                var first = record.get('first') || '';
                var last = record.get('last') || '';

                var lat = record.get('lat');
                var lng = record.get('long');

                if (city == APP_TAG && address && lat && lng) {
                    updateMarker(first+' '+last/*city+' '+address*/, first+' '+last, lat, lng);
                }
            }
        }
    }

    function updateMarker(id, name, lat, lng) {
        var pos = new google.maps.LatLng(lat, lng);
        if (!markers[id]) {
            markers[id] = new google.maps.Marker({
                position: pos,
                map: map,
                title: name
            });
            google.maps.event.addListener(markers[id], 'click', function() {
                infowindow.setContent(name);
                infowindow.open(map, markers[id]);
            });
        } else {
            markers[id].setPosition(pos);
        }
    }

    // ========= RhoConnect related code goes from here ====================

    // Here is model definitions. RhoConnect.js don't need field definitions,
    // but it is needed for Ext.data.Model instances initializing.
    // At the moment RhoConnect.js stores all values as strings.
    var modelDefinitions = [
        {
            name: 'Customer',
            fields: [
                {name: 'id',      type: 'int'},
                {name: 'first',   type: 'string'},
                {name: 'last',    type: 'string'},
                {name: 'phone',   type: 'string'},
                {name: 'email',   type: 'string'},
                {name: 'address', type: 'string'},
                {name: 'city',    type: 'string'},
                {name: 'state',   type: 'string'},
                {name: 'zip',     type: 'string'},
                {name: 'lat',     type: 'string'},
                {name: 'long',    type: 'string'}
            ]
        }
    ];

    function loginRhoConnect(username, password) {
        return $.Deferred(function(dfr){
            RhoConnect.login(username, password,
                    new RhoConnect.SyncNotification(), true /*do db init*/).done(function(){
                // Init DB for the user on success
                initRhoconnect(username, false).done(function(){
                    dfr.resolve();
                }).fail(function(errCode, err){
                    alert('DB init error: ' +errCode);
                    dfr.reject(errCode, err);
                });
            }).fail(function(errCode, err){
                alert('RhoConnect login error: ' +errCode);
                dfr.reject(errCode, err);
            });
        }).promise();
    }

    // RhoConnect.js initialization
    function initRhoconnect(username, doReset) {
        return RhoConnect.init(modelDefinitions, 'extjs', doReset);
    }

    return doAppLaunch;
})(jQuery, Ext);
