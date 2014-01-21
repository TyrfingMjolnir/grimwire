/*
CLI parsed-command executor

*/

// Executor
// ========
var Executor = {};
module.exports = Executor;

Executor.exec = function(parsed_cmds) {
	var emitter = new local.util.EventEmitter();
	emitter.next_index = 0;
	emitter.parsed_cmds = parsed_cmds;
	emitter.getNext = getNext;
	emitter.fireNext = fireNext;
	emitter.on('request', onRequest);
	emitter.on('response', onResponse);
	emitter.fireNext();
	return emitter;
};

function getNext() {
	return this.parsed_cmds[this.next_index];
}

function fireNext() {
	if (this.getNext()) {
		this.emit('request', this.getNext());
		this.next_index++;
	} else {
		this.emit('done');
	}
}

function onRequest(e) {
	var emitter = this;

	// Prep request
	var body;
	var req = new local.Request(e.request);
	// pull accept from right-side pipe
	if (e.pipe && !e.request.accept) { req.header('Accept', pipeToType(e.pipe)); }
	// pull body and content-type from left-side pipe (last request)
	if (e.last_res) {
		if (e.last_res.header('Content-Type') && !req.header('Content-Type')) {
			req.header('Content-Type', e.last_res.header('Content-Type'));
		}
		if (e.last_res.body) {
			body = e.last_res.body;
		}
	}
	// default method
	if (!e.request.method) {
		if (e.last_res) req.method = 'POST';
		else req.method = 'GET';
	}

	// Dispatch
	local.dispatch(req).always(function(res) {
		//var will_be_done = !emitter.getNext();
		emitter.emit('response', { request: req, response: res });
		/*if (will_be_done) {
			emitter.emit('done');
		}*/
	});
	req.end(body);
}

function onResponse(e) {
	var next_cmd = this.getNext();
	if (next_cmd) {
		next_cmd.last_res = e.response;
	}
	local.util.nextTick(this.fireNext.bind(this));
}

var pipeMap = {
	html: 'text/html',
	text: 'text/plain',
	plain: 'text/plain',
	json: 'application/json'
};
function pipeToType(v) {
	return pipeMap[v] || v;
}