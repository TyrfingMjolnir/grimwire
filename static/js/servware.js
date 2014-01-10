;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports.reasons = {
    "100": "Continue",
    "101": "Switching Protocols",
    "102": "Processing",
    "200": "OK",
    "201": "Created",
    "202": "Accepted",
    "203": "Non-Authoritative Information",
    "204": "No Content",
    "205": "Reset Content",
    "206": "Partial Content",
    "207": "Multi-Status",
    "300": "Multiple Choices",
    "301": "Moved Permanently",
    "302": "Found",
    "303": "See Other",
    "304": "Not Modified",
    "305": "Use Proxy",
    "307": "Temporary Redirect",
    "400": "Bad Request",
    "401": "Unauthorized",
    "402": "Payment Required",
    "403": "Forbidden",
    "404": "Not Found",
    "405": "Method Not Allowed",
    "406": "Not Acceptable",
    "407": "Proxy Authentication Required",
    "408": "Request Timeout",
    "409": "Conflict",
    "410": "Gone",
    "411": "Length Required",
    "412": "Precondition Failed",
    "413": "Payload Too Large",
    "414": "URI Too Long",
    "415": "Unsupported Media Type",
    "416": "Range Not Satisfiable",
    "417": "Expectation Failed",
    "422": "Unprocessable Entity",
    "423": "Locked",
    "424": "Failed Dependency",
    "426": "Upgrade Required",
    "428": "Precondition Required",
    "429": "Too Many Requests",
    "431": "Request Header Fields Too Large",
    "500": "Internal Server Error",
    "501": "Not Implemented",
    "502": "Bad Gateway",
    "503": "Service Unavailable",
    "504": "Gateway Time-out",
    "505": "HTTP Version Not Supported",
    "507": "Insufficient Storage",
    "511": "Network Authentication Required"
};
},{}],2:[function(require,module,exports){
function mixin(request) {
	Object.defineProperty(request, 'assert', { value: req_assert, enumerable: false });
}

function req_assert(desc) {
	// Acceptable content-type(s)
	if (desc.accept && !local.preferredType(this, desc.accept)) {
		throw 406;
	}
	// Request content-type
	if (desc.type && !Array.isArray(desc.type)) { desc.type = [desc.type]; }
	if (desc.type && desc.type.indexOf(this.headers['content-type']) === -1) {
		throw 415;
	}
	if (desc.body) {
		// Make sure a body exists
		if (!this.body) {
			throw { status: 422, reason: 'bad ent - request body required' };
		}

		// Iterate the given validators and run them on each key
		for (var validatorName in desc.body) {
			// Sanity check
			if (!(validatorName in body_validators)) {
				console.error('Invalid body validator', validatorName, 'Available validators:', Object.keys(body_validators));
				continue;
			}

			// Run validator
			var params = asArray(desc.body[validatorName]);
			body_validators[validatorName](this, params);
		}
	}
}

var body_validators = {
	'string':  mkTypeValidator('string'),
	'number':  mkTypeValidator('number'),
	'boolean': mkTypeValidator('boolean'),
	'object':  mkTypeValidator('object'),
	'notnull': function(req, params) {
		params.forEach(function(param) {
			if (req.body[param] === null) {
				throw { status: 422, reason: 'bad ent - `'+param+'` must not be null' };
			}
		});
	},
	'defined': function(req, params) {
		params.forEach(function(param) {
			if (typeof req.body[param] == 'undefined') {
				throw { status: 422, reason: 'bad ent - `'+param+'` must not be undefined' };
			}
		});
	},
	'truthy': function(req, params) {
		params.forEach(function(param) {
			if (!req.body[param]) {
				throw { status: 422, reason: 'bad ent - `'+param+'` must not be falsey' };
			}
		});
	}
};

function mkTypeValidator(type) {
	return function(req, params) {
		params.forEach(function(param) {
			if (typeof req.body[param] != type) {
				throw { status: 422, reason: 'bad ent - `'+param+'` must be of type "'+type+'"' };
			}
		});
	};
}

function asArray(v) {
	return Array.isArray(v) ? v : [v];
}

module.exports = mixin;
},{}],3:[function(require,module,exports){
function mixin(response) {
	Object.defineProperty(response, 'link', { value: res_link, enumerable: false });
}

// Adds a link to the response
// - linkObj: required object|Array(object)
function res_link(linkObj) {
	// Handle array version
	if (Array.isArray(linkObj)) {
		linkObj.forEach(function(link) { this.link(link); }.bind(this));
		return;
	}

	// Add link
	if (!this.headers.link) { this.headers.link = []; }
	this.headers.link.push(linkObj);
}

module.exports = mixin;
},{}],4:[function(require,module,exports){
function Route(path) {
	this.path = path;
	this.links = [];
	this.methods = {};

	// Set a default HEAD method
	this.method('HEAD', function() { return 204; });
}

// Add a link to all responses in the route
// - linkObj: required object
Route.prototype.link = function(linkObj) {
	this.links.push(linkObj);
};

// Add a method to the route
// - method: required string|Array(string), the verb(s)
// - opts: optional object, config options for the method behavior
//   - opts.stream: bool, does not wait for the request to end before handling if true
// - cb*: required functions, the handler functions
Route.prototype.method = function() {
	var method = arguments[0];
	if (Array.isArray(method)) {
		var args = Array.prototype.slice.call(arguments, 1);
		method.forEach(function(method) { this.method.apply(this, [method].concat(args)); }.bind(this));
		return;
	}

	// Extract arguments
	var opts = (typeof arguments[1] == 'object') ? arguments[1] : null;
	var hindex = opts ? 2 : 1;
	var handlers = Array.prototype.slice.call(arguments, hindex);

	// Mix in options
	for (var k in opts) {
		handlers[k] = opts[k];
	}
	this.methods[method] = handlers;
};

module.exports = Route;
},{}],5:[function(require,module,exports){
var Route = require('./route');
var reqMixin = require('./request');
var resMixin = require('./response');
var reasons = require('./http-constants').reasons;

function servware() {
	var routes = {};
	var routeRegexes = [];
	var serverFn = function() {
		var args = Array.prototype.slice.call(arguments);
		var req = args[0], res = args[1];

		// Mixin request and response additions
		reqMixin(req);
		resMixin(res);

		// Match the path
		for (var i=0; i < routeRegexes.length; i++) {
			var match = routeRegexes[i].exec(req.path);
			if (match) {
				// Extract params
				req.pathArgs = match.slice(1);
				var path = routeRegexes[i].path;
				var pathTokenMap = routeRegexes[i].tokenMap;
				var route = routes[path];

				// Match the method
				var methodHandlers = route.methods[req.method];
				if (methodHandlers) {
					// Add tokens to pathArgs
					for (var k in pathTokenMap) {
						req.pathArgs[pathTokenMap[k]] = req.pathArgs[k];
					}

					// Pull route links into response
					if (route.links.length) {
						res.setHeader('link', route.links.slice(0));
					}

					// Patch serializeHeaders() to replace path tokens
					var orgSeralizeHeaders = res.serializeHeaders;
					Object.defineProperty(res, 'serializeHeaders', { value: function() {
						orgSeralizeHeaders.call(this);
						if (!this.headers.link) return;
						for (var k in pathTokenMap) {
							var token = ':'+pathTokenMap[k];
							this.headers.link = this.headers.link.replace(RegExp(token, 'g'), req.pathArgs[k]);
						}
					}, configurable: true });

					// Define post-handler behavior
					function handleReturn (resData) {
						// Go to the next handler if given true (the middleware signal)
						if (resData === true) {
							handlerIndex++;
							if (!methodHandlers[handlerIndex]) {
								console.error('Route handler returned true but no further handlers were available');
								return res.writeHead(500, reasons[500]).end();
							}
							local.promise(true).then(function() { return methodHandlers[handlerIndex].apply(route, args); }).always(handleReturn);
						} else {
							// Fill the response, if needed
							if (resData) { writeResponse(res, resData); }
						}
					}

					// If not streaming, wait for body; otherwise, go immediately
					var handlerIndex = 0;
					var p = (!methodHandlers.stream) ? req.body_ : local.promise(true);
					p.then(function() {
						// Run the handler
						return methodHandlers[handlerIndex].apply(route, args);
					}).always(handleReturn);
					return;
				} else {
					return res.writeHead(405, reasons[405]).end();
				}
			}
		}
		res.writeHead(404, reasons[404]).end();
	};
	serverFn.route = function(path, defineFn) {
		// Parse named tokens and create a token map
		var pathTokenMap = {}; // regex match index -> token name (eg {0: 'section', 1: 'id'})
		path = parsePathTokens(path, pathTokenMap);

		// Create the regex to do path routing
		var regex = new RegExp('^'+path+'$', 'i');
		regex.path = path; // store so we can find the route on match
		regex.tokenMap = pathTokenMap; // store so we can assign values to tokens on match
		routeRegexes.push(regex);

		// Create the route object
		var route = new Route(path);
		routes[path] = route;

		// Call the given definer
		defineFn.call(route, route.link.bind(route), route.method.bind(route));
	};
	return serverFn;
}

function writeResponse(res, data) {
	// Standardize data
	var head = [null, null, null];
	var body = undefined;
	if (Array.isArray(data)) {
		head[0] = data[0];
		head[1] = reasons[data[0]] || null;
		body    = data[1];
		head[2] = data[2] || {};
	}
	else if (typeof data == 'number') {
		head[0] = data;
		head[1] = reasons[data] || null;
		head[2] = {};
	}
	else if (typeof data == 'object' && data) {
		head[0] = data.status;
		head[1] = data.reason || reasons[data.status] || null;
		body    = data.body;
		head[2] = data.headers || {};
	}
	else {
		throw new Error('Unusuable response given');
	}

	// Set headers on the response object
	for (var k in head[2]) {
		res.setHeader(k, head[2][k]);
	}

	// Set default content-type if needed
	if (typeof body != 'undefined' && !res.headers['content-type']) {
		res.setHeader('content-type', (typeof body == 'string') ? 'text/plain' : 'application/json');
	}

	// Write response
	if (!res.status) {
		res.writeHead.apply(res);
	}
	res.end(body);
}

function parsePathTokens(path, tokenMap) {
	// Extract the tokens in their positions within the regex match (less 1, because we drop the first value in the match array)
	var i=0, match, re = /(:([^\/]*))|\(.+\)/g;
	while ((match = re.exec(path))) {
		if (match[0].charAt(0) == ':') { // token or just a regex group?
			tokenMap[i] = match[2]; // map the position to the token name
		}
		i++;
	}
	// Replace tokens with standard path part groups
	return path.replace(/(:[^\/]*)/g, '([^/]*)');
}

(typeof window == 'undefined' ? self : window).servware = servware;
},{"./http-constants":1,"./request":2,"./response":3,"./route":4}]},{},[5])
;