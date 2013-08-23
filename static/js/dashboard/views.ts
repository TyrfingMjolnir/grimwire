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
		hosts: Array<string>;
		allowedApps: Array<string>;
		recommendedApps: Array<string>;

		userId: string;
		userApps: Array<string>;
	}

	export class Station extends Backbone.View {

		template: (data: StationTemplateData) => string;
		adminTemplate: (data: StationTemplateData) => string;
		model: Models.Station;

		$footer: any;
		oldInvitesState: string;

		constructor (options?) {
			this.events = {
				'click .dismiss-station': 'close',
				'click .admin-btn': 'toggleAdmin',
				'click .create-station': 'toggleAdmin',
				'click .toggle-advanced': 'adminToggleAdvanced',
				'click .update-settings': 'adminUpdateSettings',
				'click .close-station': 'adminCloseStation',
				'click .invite-just-me': 'adminInviteJustMe'
			};
			super(options);
			this.template = _.template($('#station-template').html());
			this.adminTemplate = _.template($('#station-admin-template').html());

			_.bindAll(this, 'render', 'remove', 'refresh', 'close', 'toggleAdmin', 'adminToggleAdvanced', 'adminUpdateSettings', 'adminCloseStation');
			this.model.bind('change', this.render);
			this.model.bind('remove', this.remove);
		}

		render() {
			this.$el.html(this.template(this.model.toJSON()));
			this.$footer = this.$('.panel-footer');
			this.$footer.html(this.adminTemplate(this.model.toJSON())); // :TODO: this should only happen if admin (or admin-to-be (for inactive stations))
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

		// Open/close admin advanced items
		adminToggleAdvanced() {
			this.$('.form-advanced').collapse('toggle');
		}

		// POST update and refresh ui
		adminUpdateSettings(e: any) {
			e.preventDefault();
			// :TODO:
			console.debug(this.$('form').serializeArray());
			this.refresh();
		}

		// DELETE station
		adminCloseStation(e: any) {
			e.preventDefault();
			confirm('Close /'+this.model.get('id')+'? This will stop users from being able to connect through this station.');
			// :TODO:
		}

		// Change invited users to just me
		adminInviteJustMe(e: any) {
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

	}

	export class App extends Backbone.View {

		$stationIdInput: any;
		$stationList: any;
		$scratchPad: any;
		events = {
			'keypress #station-id': 'createOnEnter',
			'blur #scratchpad': 'saveScratchpad',
		};

		userStations = new Collections.Station();

		constructor () {
			super();
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

		saveScratchpad(e) {
			if (localStorage) {
				localStorage.setItem('scratchpad', this.$scratchPad.val());
			}
		}

	}
}