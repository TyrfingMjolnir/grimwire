var Models = Models || {};
Models.Station = Backbone.Model.extend({
    defaults: function () {
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
    },

    initialize: function () {
    }
});
