/// <reference path="../backbone.d.ts" />
/// <reference path="models.ts" />
/// <reference path="collections.ts" />

module Views {

	export interface StationTemplateData {
		id: string;
		name: string;
		members: Array<string>;
		admins: Array<string>;
		invites: Array<string>;
		allowedApps: Array<string>;
		recommendedApps: Array<string>;
	}

	export class Station extends Backbone.View {

		template: (data: StationTemplateData) => string;
		adminTemplate: (data: StationTemplateData) => string;
		$footer: any;
		model: Models.Station;

		constructor (options?) {
			this.events = {
				'click .toolbar-refresh': 'refresh',
				'click .toolbar-close': 'close',
				'click .admin-btn': 'toggleAdmin',
				'click .update-settings': 'updateSettings'
			};
			super(options);
			this.template = _.template($('#station-template').html());
			this.adminTemplate = _.template($('#station-admin-template').html());

			_.bindAll(this, 'render', 'remove', 'refresh', 'close', 'toggleAdmin', 'updateSettings');
			this.model.bind('change', this.render);
			this.model.bind('remove', this.remove);
		}

		render() {
			this.$el.html(this.template(this.model.toJSON()));
			this.$footer = this.$('.panel-footer');
			this.$footer.html(this.adminTemplate(this.model.toJSON())); // :TODO: this should only happen if admin
			this.$('.popover-link').popover({ html: true });
			return this;
		}

		// GET latest values
		refresh() {
			this.model.fetch();
			return this;
		}

		// Remove the model from the collection on close
		close() {
			this.model.collection.remove(this.model);
		}

		// Open/close admin footer
		toggleAdmin() {
			this.$footer.collapse('toggle');
		}

		// POST update and refresh ui
		updateSettings() {
			// :TODO:
			console.debug(this.$('form.settings').serializeArray());
			this.refresh();
		}

	}

	export class App extends Backbone.View {

		$stationIdInput: any;
		$stationList: any;
		events = {
			'keypress #station-id': 'createOnEnter'
		};

		userStations = new Collections.Station();

		constructor () {
			super();
			this.setElement($('#dashboardapp'), true);
			this.$stationIdInput = this.$('#station-id');
			this.$stationList = this.$('#stations');
			_.bindAll(this, 'render', 'addOne', 'addAll', 'createOnEnter');

			this.userStations.bind('add', this.addOne);
			this.userStations.bind('reset', this.addAll);
			this.userStations.bind('all', this.render);
			//this.userStations.fetch();
		}

		render() {
		}

		addOne(station: Models.Station) {
			var view = new Views.Station({ model: station });
			this.$stationList.append(view.render().el);
		}

		addAll() {
			this.userStations.each(this.addOne);
		}

		createOnEnter(e) {
			if (e.keyCode != 13) return;
			console.debug(this.$stationIdInput.val());
			// :TODO:
		}

	}
}