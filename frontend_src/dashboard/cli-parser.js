/*
CLI command parser

Examples:
  - A single, full command:
	agent> get apps/foo --From=pfraze@grimwire.net [application/json]
  - A single command using defaults (method=GET, Accept=*, agent=none):
	apps/foo
  - A fat pipe command:
	GET apps/foo [application/json] POST apps/bar
  - A fat pipe command with defaults:
    apps/foo [] apps/bar

command      = [ agent ] request [ content-type ] .
agent        = token '>' .
request      = [ method ] uri { header-flag } .
header-flag  = [ '-' | '--' ] header-key '=' header-value .
content-type = '[' token ']' .
method       = token .
uri          = ns-token .
header-key   = token .
header-value = token | string .
string       = '"' { token } '"' .
token        = /([-\w]*)/ .
ns-token     = /(\S*)/ .
*/

// Parser
// ======
var Parser = { buffer: null, trash: null, buffer_position: 0, buffer_size: 0, logging: false };
module.exports = Parser;

// Main API
// - Generates an array of { agent:, request:, pipe: } objects
//  - `agent` is the string name of the agent used
//  - `request` is an object-literal request form
//  - `pipe` is the string mimetype in the fat pipe
Parser.parse = function(buffer) {
	Parser.buffer = buffer;
	Parser.trash = '';
	Parser.buffer_position = 0;
	this.buffer_size = buffer.length;

	var output = [];
	while (!this.isFinished()) {
		output.push(Parser.readCommand());
	}

	return output;
};

Parser.moveBuffer = function(dist) {
	this.trash += this.buffer.substring(0, dist);
	this.buffer = this.buffer.substring(dist);
	this.buffer_position += dist;
	this.log('+', dist);
};

Parser.isFinished = function() {
	if (this.buffer_position >= this.buffer_size || !/\S/.test(this.buffer))
		return true;
	return false;
};

Parser.readCommand = function() {
	// command = [ agent ] request [ request ] .
	// ================================================
	this.log = ((this.logging) ? (function() { console.log.apply(console,arguments); }) : (function() {}));
	this.log('>> Parsing:',this.buffer);

	var agent = this.readAgent();

	var request = this.readRequest();
	if (!request) { throw "Expected request"; }

	var pipe = this.readContentType();

	this.log('<< Finished parsing:', agent, request);
	return { agent: agent, request: request, pipe: pipe };
};

Parser.readAgent = function() {
	// agent = token '>' .
	// ===================
	// read non spaces...
	var match = /^\s*(\S*)/.exec(this.buffer);
	if (match && />/.test(match[1])) { // check for the identifying angle bracket
		var match_parts = match[1].split('>');
		var agent = match_parts[0];
		this.moveBuffer(agent.length+1);
		this.log('Read agent:', agent);
		return agent;
	}
	return false;
};

Parser.readRequest = function() {
	// request = [ method ] uri { header-flag } .
	// ==========================================
	var targetUri = false, method = false, headers = {}, start_pos;
	start_pos = this.buffer_position;
	// Read till no more request features
	while (true) {
		var headerSwitch = this.readHeaderSwitch();
		if (headerSwitch) {
			// shouldn't come before method & uri
			if (!targetUri && !method) { throw "Unexpected header flag '" + headerSwitch + "'"; }
			headers[headerSwitch.key.toLowerCase()] = headerSwitch.value;
			continue;
		}
		var string = this.readNSToken();
		if (string) {
			// no uri, assume that's what it is
			if (!targetUri) { targetUri = string; }
			else if (!method) {
				// no method, the first item was actually the method and this is the uri
				method = targetUri;
				targetUri = string;
			} else {
				throw "Unexpected token '" + string + "'";
			}
			continue;
		}
		break;
	}
	// Return a request if we got a URI; otherwise, no match
	if (!targetUri) { return false; }
	var request = { headers: headers };
	request.method = method;
	request.url = targetUri;
	this.log(request);
	return request;
};

Parser.readContentType = function() {
	// content-type = "[" [ token | string ] "]" .
	// ===========================================
	var match;

	// match opening bracket
	match = /^\s*\[\s*/.exec(this.buffer);
	if (!match) { return false; }
	this.moveBuffer(match[0].length);

	// read content-type
	match = /^[\w\/\*.0-9\+]+/.exec(this.buffer);
	var contentType = (!!match) ? match[0] : null;
	if (contentType)  { this.moveBuffer(contentType.length); }

	// match closing bracket
	match = /^\s*\]\s*/.exec(this.buffer);
	if (!match) { throw "Closing bracket ']' expected after content-type"; }
	this.moveBuffer(match[0].length);

	this.log('Read mimetype:', contentType);
	return contentType;
};

Parser.readHeaderSwitch = function() {
	// header-flag = [ "-" | "--" ] header-key "=" header-value .
	// ================================================
	var match, headerKey, headerValue;

	// match switch
	match = /^\s*-[-]*/.exec(this.buffer);
	if (!match) { return false; }
	this.moveBuffer(match[0].length);

	// match key
	headerKey = this.readToken();
	if (!headerKey) { throw "Header name expected after '--' switch."; }

	// match '='
	match = /^\s*\=\s*/.exec(this.buffer);
	if (match) {
		// match value
		this.moveBuffer(match[0].length);
		headerValue = this.readString() || this.readToken();
		if (!headerValue) { throw "Value expected for --" + headerKey; }
	} else {
		// default value to `true`
		headerValue = true;
	}

	var header = { key:headerKey, value:headerValue };
	this.log('Read header:', header);
	return header;
};

Parser.readString = function() {
	var match;

	// match opening quote
	match = /^\s*[\"]/.exec(this.buffer);
	if (!match) { return false; }
	this.moveBuffer(match[0].length);

	// read the string till the next quote
	var string = '';
	while (this.buffer.charAt(0) != '"') {
		var c = this.buffer.charAt(0);
		this.moveBuffer(1);
		if (!c) { throw "String must be terminated by a second quote"; }
		string += c;
	}
	this.moveBuffer(1);

	this.log('Read string:', string);
	return string;
};

Parser.readNSToken = function() {
	// read pretty much anything
	var match = /^\s*(\S*)/.exec(this.buffer);
	if (match && match[1].charAt(0) != '[') { // dont match a pipe
		this.moveBuffer(match[0].length);
		this.log('Read uri:', match[1]);
		return match[1];
	}

	return false;
};

Parser.readToken = function() {
	// read the token
	var match = /^\s*([-\w]*)/.exec(this.buffer);
	if (!match) { return false; }
	this.moveBuffer(match[0].length);
	this.log('Read token:', match[1]);
	return match[1];
};