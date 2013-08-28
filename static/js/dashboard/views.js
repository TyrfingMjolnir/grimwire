var Views = Views || {};
Views.Station = Backbone.View.extend({
    events: {
        'click .dismiss-station': 'close',
        'click .admin-btn': 'toggleAdmin',
        'click .create-station': 'toggleAdmin',
        'click .toggle-advanced': 'adminToggleAdvanced',
        'click .update-settings': 'adminUpdateSettings',
        'click .close-station': 'adminCloseStation',
        'click .invite-just-me': 'adminInviteJustMe'
    },

    initialize: function() {
        this.template = _.template($('#station-template').html());
        this.adminTemplate = _.template($('#station-admin-template').html());

        _.bindAll(this, 'render', 'remove', 'refresh', 'close', 'toggleAdmin', 'adminToggleAdvanced', 'adminUpdateSettings', 'adminCloseStation');
        this.model.bind('change', this.render);
        this.model.bind('remove', this.remove);
    },

    render: function () {
        this.$el.html(this.template(this.model.toJSON()));
        this.$footer = this.$('.panel-footer');
        this.$footer.html(this.adminTemplate(this.model.toJSON()));
        this.$('.popover-link').popover({ html: true });
        return this;
    },

    // GET latest values
    refresh: function () {
        this.model.fetch();
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

        // :TODO:
        console.debug(this.$('form').serializeArray());
        this.refresh();
    },

    // DELETE station
    adminCloseStation: function (e) {
        e.preventDefault();
        confirm('Close /' + this.model.get('id') + '? This will stop users from being able to connect through this station.');
        // :TODO:
    },

    // Change invited users to just me
    adminInviteJustMe: function (e) {
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
    }
});

Views.App = Backbone.View.extend({
    events: {
        'keypress #station-id': 'createOnEnter',
        'blur #scratchpad': 'saveScratchpad'
    },
    initialize: function() {
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
        if (e.keyCode != 13)
            return;
        console.debug(this.$stationIdInput.val());
        // :TODO:
    },

    saveScratchpad: function (e) {
        if (localStorage) {
            localStorage.setItem('scratchpad', this.$scratchPad.val());
        }
    }
});
