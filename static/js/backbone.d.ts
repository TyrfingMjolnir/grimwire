declare var $: any;
declare module Backbone {
	export class Model {
		constructor (attr? , opts? );
		collection: any;
		get(name: string): any;
		set(name: string, val: any): void;
		set(obj: any): void;
		clear(opts?: any): void;
		fetch(opts?: any): any;
		save(attr? , opts? ): void;
		destroy(): void;
		bind(ev: string, f: Function, ctx?: any): void;
		toJSON(): any;
	}
	export class Collection {
		constructor (models? , opts? );
		bind(ev: string, f: Function, ctx?: any): void;
		collection: Model;
		length: number;
		add(models, opts?): void;
		create(attrs, opts? ): Collection;
		each(f: (elem: any) => void ): void;
		fetch(opts?: any): void;
		last(): any;
		last(n: number): any[];
		filter(f: (elem: any) => any): Collection;
		without(...values: any[]): Collection;
	}
	export class View {
		constructor (options? );
		$(selector: string): any;
		el: HTMLElement;
		$el: any;
		model: Model;
		remove(): void;
		delegateEvents: any;
		make(tagName: string, attrs? , opts? ): View;
		setElement(element: HTMLElement, delegate?: boolean): void;
		tagName: string;
		events: any;

		static extend: any;
	}
}
declare var _: any;
declare var Store: any;