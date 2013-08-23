/// <reference path="../backbone.d.ts" />

module Models {

	export class Station extends Backbone.Model {

		defaults() {
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
			}
		}

		initialize() {
		}

	}

}