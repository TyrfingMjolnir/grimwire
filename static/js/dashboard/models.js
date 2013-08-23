/// <reference path="../backbone.d.ts" />
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var Models;
(function (Models) {
    var Station = (function (_super) {
        __extends(Station, _super);
        function Station() {
            _super.apply(this, arguments);
        }
        Station.prototype.defaults = function () {
            return {
                id: '',
                name: '',
                members: [],
                admins: [],
                invites: [],
                hosts: [],
                allowedApps: [],
                recommendedApps: [],
                userId: '',
                userApps: []
            };
        };

        Station.prototype.initialize = function () {
        };
        return Station;
    })(Backbone.Model);
    Models.Station = Station;
})(Models || (Models = {}));
