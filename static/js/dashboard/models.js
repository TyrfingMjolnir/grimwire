var Models = Models || {};
Models.Station = Backbone.Model.extend({
    defaults: function () {
        return {
            id: '',
            name: '',
            admins: [],
            invites: [],
            hosters: [],
            allowed_apps: [],
            recommended_apps: [],
            online_users: [],
            user_is_invited: false,
            userId: '',
            userApps: [],
            status: 'Inactive'
        };
    },

    initialize: function () {
    }
});
