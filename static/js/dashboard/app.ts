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
			allowedApps: [],
			recommendedApps: ['chat.grimwire.com', 'github.com'],

			userId: 'bob',
			userApps: ['chat.grimwire.com', 'github.com']
		},
		{
			id: 'foobaz',
			name: 'Foobaz',

			members: ['jimmy'],
			admins: ['jimmy'],
			allowedApps: ['chat.grimwire.com', 'github.com'],

			userId: 'bob'
		},
		{
			id: 'foobar',

			userId: 'bob'
		},
		{
			id: 'gregs-palace',

			members: ['greg'],
			invites: ['greg'],

			userId: 'bob'
		}
	]);
});
