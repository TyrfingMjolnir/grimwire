/// <reference path="views.ts" />

$(() => {
	var app = new Views.App();

	// DEBUG
	app.userStations.add([
		{
			id: 'grimdev',
			name: 'Grimwire Dev Team',

			members: ['bob', 'alice', 'john', 'tim'],
			admins: ['bob'],
			invites: ['susan', 'alice', 'john', 'tim'],

			allowedApps: ['*'],
			recommendedApps: ['chat.grimwire.net', 'github.com'],

			userIsInvited: true,
			userApps: ['chat.grimwire.net', 'github.com']
		},
		{
			id: 'foobar'
		},
		{
			id: 'bobs-palace',
			name: 'Bob\'s Palace',

			members: ['greg'],
			invites: ['greg']
		}
	]);
});
