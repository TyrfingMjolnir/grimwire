var Views = Views || {};
Views.Station = Backbone.View.extend({
    events: {
        'click .dismiss-station': 'close',
        'click .admin-btn': 'toggleAdmin',
        'click .create-station': 'toggleAdmin',
        'click .toggle-advanced': 'adminToggleAdvanced',
        'request form': 'adminUpdateSettings'
    },

    initialize: function() {
        // Cache templates
        this.template = _.template($('#station-template').html());
        this.adminTemplate = _.template($('#station-admin-template').html());
        // Cache API resolution
        this.relayAPI = window.app.prnStationsAPI.follow({ rel: 'grimwire.com/-webprn/relay', id: this.model.get('id') });
        this.relayAPI.resolve();
        // Cache function bindings
        _.bindAll(this, 'render', 'remove', 'refresh', 'close', 'toggleAdmin', 'adminToggleAdvanced', 'adminUpdateSettings', 'adminCloseStation', 'adminInviteJustMe');

        // Bind events
        this.model.bind('change', this.render);
        this.model.bind('remove', this.remove);
    },

    render: function () {
        // Render
        this.$el.html(this.template(this.model.toJSON()));
        this.$footer = this.$('.panel-footer');
        this.$footer.html(this.adminTemplate(this.model.toJSON()));

        // Bind behaviors
        this.$('.popover-link').popover({ html: true });
        this.$('.invite-just-me').on('click', this.adminInviteJustMe); // Bind here to override the request event (eugh)
        this.$('.close-station').on('click', this.adminCloseStation); // Bind here to override the request event (eugh)
        local.bindRequestEvents(this.$('form')[0]);
        return this;
    },

    // GET latest values
    refresh: function () {
        // Refresh with canonical copy
        var model = this.model;
        this.relayAPI.get({ accept: 'application/json' })
            .then(function(res) {
                model.set(res.body);
                // :TODO: notify user
            })
            .fail(function(res) {
                var v = model.defaults();
                v.id = model.get('id');
                model.set(v);
            });
        return this;
    },

    // Remove the model from the collection on close
    close: function () {
        this.model.collection.remove(this.model);
    },

    // Open/close admin footer
    toggleAdmin: function () {
        this.$footer.collapse('toggle');
    },

    // Open/close admin advanced items
    adminToggleAdvanced: function () {
        this.$('.form-advanced').collapse('toggle');
    },

    // POST update and refresh ui
    adminUpdateSettings: function (e) {
        e.preventDefault();

        // Send patch request to our API
        var self = this;
        var request = e.originalEvent.detail;
        var body = request.body;
        this.relayAPI.patch(body, { 'content-type': 'application/json' })
            .fail(function(res) {
                // :TODO: notify user
                console.warn('Failed to update station', res);
            })
            .then(function(res) {
                self.refresh();
            });
    },

    // DELETE station
    adminCloseStation: function (e) {
        var self = this;
        e.preventDefault();
        if (confirm('Close /' + this.model.get('id') + '? This will stop users from being able to connect through this station.')) {
            // Send a DELETE
            this.relayAPI.delete()
                .fail(function(res) {
                    // :TODO: notify user
                    console.warn('Failed to delete station', res);
                })
                .then(function(res) {
                    self.refresh();
                });
        }
        return false;
    },

    // Change invited users to just me
    adminInviteJustMe: function (e) {
        if (typeof this.oldInvitesState == 'string') {
            this.$('[name=invites]').val(this.oldInvitesState);
            this.oldInvitesState = null;
            this.$('.invite-just-me').text('Just Me');
        } else {
            this.oldInvitesState = this.$('[name=invites]').val();
            this.$('[name=invites]').val(this.model.get('userId'));
            this.$('.invite-just-me').text('Undo');
        }
        return false;
    }
});

Views.App = Backbone.View.extend({
    events: {
        'keypress #station-id': 'createOnEnter',
        'blur #scratchpad': 'saveScratchpad'
    },
    initialize: function() {
        // Web APIs
        this.prnServiceAPI = local.navigator('//grimwire.net:8000'); // PRN provider
        this.prnServiceAPI = this.prnServiceAPI.follow({ rel: 'self grimwire.com/-webprn/service' }); // Verify protocol support
        this.prnStationsAPI = this.prnServiceAPI.follow({ rel: 'grimwire.com/-webprn/relays', id: 'stations' });
        this.prnServiceAPI.resolve(); // Force resolution at loadtime
        this.prnStationsAPI.resolve();

        // Collection of currently open stations
        this.userStations = new Collections.Station();

        // Cache selectors & fn bindings
        this.setElement($('#dashboardapp'), true);
        this.$stationIdInput = this.$('#station-id');
        this.$stationList = this.$('#stations');
        this.$scratchPad = this.$('#scratchpad');
        _.bindAll(this, 'render', 'addOne', 'addAll', 'createOnEnter');

        // Bind collection events
        this.userStations.bind('add', this.addOne);
        this.userStations.bind('reset', this.addAll);
        this.userStations.bind('all', this.render);

        // Load scratchpad content from localstorage
        var v = localStorage.getItem('scratchpad');
        if (v !== null) {
            this.$scratchPad.val(v);
        }
    },

    render: function () {
    },

    addOne: function (station) {
        var view = new Views.Station({ model: station });
        this.$stationList.append(view.render().el);
    },

    addAll: function () {
        this.userStations.each(this.addOne);
    },

    createOnEnter: function (e) {
        if (e.keyCode != 13) { // Enter
            return;
        }
        var self = this;
        var stationId = this.$stationIdInput.val();
        this.prnStationsAPI.follow({ rel: 'grimwire.com/-webprn/relay', id: stationId })
            .get({ accept: 'application/json' })
            .then(function(res) {
                self.userStations.add({
                    id: res.body.id,
                    name: res.body.name,

                    admins: res.body.admins,
                    invites: res.body.invites,
                    hosters: res.body.hosters,
                    allowed_apps: res.body.allowed_apps,
                    recommended_apps: res.body.recommended_apps,

                    online_users: res.body.online_users,
                    status: res.body.status,
                    created_at: res.body.created_at,
                    user_is_invited: res.body.user_is_invited,

                    userId: 'pfraze' // :DEBUG:
                    // userApps: ['chat.grimwire.com', 'github.com'] // :DEBUG:
                });
            })
            .fail(function(res) {
                if (res.status == 404) {
                    self.userStations.add({
                        id: stationId,
                        userId: 'pfraze' // :DEBUG:
                    });
                } else {
                    console.warn(res);
                }
            });
    },

    saveScratchpad: function (e) {
        if (localStorage) {
            localStorage.setItem('scratchpad', this.$scratchPad.val());
        }
    }
});
