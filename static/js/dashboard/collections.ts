/// <reference path="../backbone.d.ts" />
/// <reference path="models.ts" />

module Collections {

	export class Station extends Backbone.Collection {

		model = Models.Station;

	}

}