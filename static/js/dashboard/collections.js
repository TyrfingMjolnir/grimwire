/// <reference path="../backbone.d.ts" />
/// <reference path="models.ts" />
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var Collections;
(function (Collections) {
    var Station = (function (_super) {
        __extends(Station, _super);
        function Station() {
            _super.apply(this, arguments);
            this.model = Models.Station;
        }
        return Station;
    })(Backbone.Collection);
    Collections.Station = Station;
})(Collections || (Collections = {}));
