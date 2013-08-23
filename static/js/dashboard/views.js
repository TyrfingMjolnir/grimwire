/// <reference path="../backbone.d.ts" />
/// <reference path="models.ts" />
/// <reference path="collections.ts" />
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var Views;
(function (Views) {
    var Station = (function (_super) {
        __extends(Station, _super);
        function Station(options) {
            this.events = {
                'click .dismiss-station': 'close',
                'click .admin-btn': 'toggleAdmin',
                'click .create-station': 'toggleAdmin',
                'click .toggle-advanced': 'adminToggleAdvanced',
                'click .update-settings': 'adminUpdateSettings',
                'click .close-station': 'adminCloseStation',
                'click .invite-just-me': 'adminInviteJustMe'
            };
            _super.call(this, options);
            this.template = _.template($('#station-template').html());
            this.adminTemplate = _.template($('#station-admin-template').html());

            _.bindAll(this, 'render', 'remove', 'refresh', 'close', 'toggleAdmin', 'adminToggleAdvanced', 'adminUpdateSettings', 'adminCloseStation');
            this.model.bind('change', this.render);
            this.model.bind('remove', this.remove);
        }
        Station.prototype.render = function () {
            this.$el.html(this.template(this.model.toJSON()));
            this.$footer = this.$('.panel-footer');
            this.$footer.html(this.adminTemplate(this.model.toJSON()));
            this.$('.popover-link').popover({ html: true });
            return this;
        };

        // GET latest values
        Station.prototype.refresh = function () {
            this.model.fetch();
            return this;
        };

        // Remove the model from the collection on close
        Station.prototype.close = function () {
            this.model.collection.remove(this.model);
        };

        // Open/close admin footer
        Station.prototype.toggleAdmin = function () {
            this.$footer.collapse('toggle');
        };

        // Open/close admin advanced items
        Station.prototype.adminToggleAdvanced = function () {
            this.$('.form-advanced').collapse('toggle');
        };

        // POST update and refresh ui
        Station.prototype.adminUpdateSettings = function (e) {
            e.preventDefault();

            // :TODO:
            console.debug(this.$('form').serializeArray());
            this.refresh();
        };

        // DELETE station
        Station.prototype.adminCloseStation = function (e) {
            e.preventDefault();
            confirm('Close /' + this.model.get('id') + '? This will stop users from being able to connect through this station.');
            // :TODO:
        };

        // Change invited users to just me
        Station.prototype.adminInviteJustMe = function (e) {
            e.preventDefault();
            if (typeof this.oldInvitesState == 'string') {
                this.$('#invites').val(this.oldInvitesState);
                this.oldInvitesState = null;
                this.$('.invite-just-me').text('Just Me');
            } else {
                this.oldInvitesState = this.$('#invites').val();
                this.$('#invites').val(this.model.get('userId'));
                this.$('.invite-just-me').text('Undo');
            }
        };
        return Station;
    })(Backbone.View);
    Views.Station = Station;

    var App = (function (_super) {
        __extends(App, _super);
        function App() {
            _super.call(this);
            this.events = {
                'keypress #station-id': 'createOnEnter',
                'blur #scratchpad': 'saveScratchpad'
            };
            this.userStations = new Collections.Station();
            this.setElement($('#dashboardapp'), true);
            this.$stationIdInput = this.$('#station-id');
            this.$stationList = this.$('#stations');
            this.$scratchPad = this.$('#scratchpad');
            _.bindAll(this, 'render', 'addOne', 'addAll', 'createOnEnter');

            this.userStations.bind('add', this.addOne);
            this.userStations.bind('reset', this.addAll);
            this.userStations.bind('all', this.render);

            //this.userStations.fetch();
            var v = localStorage.getItem('scratchpad');
            if (v != null) {
                this.$scratchPad.val(v);
            }
        }
        App.prototype.render = function () {
        };

        App.prototype.addOne = function (station) {
            var view = new Views.Station({ model: station });
            this.$stationList.append(view.render().el);
        };

        App.prototype.addAll = function () {
            this.userStations.each(this.addOne);
        };

        App.prototype.createOnEnter = function (e) {
            if (e.keyCode != 13)
                return;
            console.debug(this.$stationIdInput.val());
            // :TODO:
        };

        App.prototype.saveScratchpad = function (e) {
            if (localStorage) {
                localStorage.setItem('scratchpad', this.$scratchPad.val());
            }
        };
        return App;
    })(Backbone.View);
    Views.App = App;
})(Views || (Views = {}));
