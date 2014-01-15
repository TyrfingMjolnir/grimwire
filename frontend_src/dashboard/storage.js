/*
httpl://storage

Simple local/session storage server
*/

var server = servware();
module.exports = server;

function checkPerms(req, res) {
	var from = req.headers['From'] || req.headers.from; // :TODO: temporary situation
	// No peer users
	if (from && from.indexOf('@') !== -1)
		throw 403;
	// Buckets are currently only allowed for the domain of the same name
	if (req.pathArgs.bucket && req.pathArgs.bucket != from)
		throw 403;
	return true;
}

server.route('/', function(link, method) {
	link({ href: 'httpl://hosts', rel: 'via', id: 'hosts', title: 'Page' });
	link({ href: '/', rel: 'self service collection', id: 'storage', title: 'KVStore', hidden: true });
	link({ href: '/{storage}/{bucket}/{id}', rel: 'item', title: 'KV', hidden: true });

	method('HEAD', checkPerms, function() { return 204; });
});

server.route('/:storage/:bucket/:id', function(link, method) {
	link({ href: 'httpl://hosts', rel: 'via', id: 'hosts', title: 'Page' });
	link({ href: '/', rel: 'up service collection', id: 'storage', title: 'KVStore' });
	link({ href: '/:storage/:bucket/:id', rel: 'self item', storage: ':storage', bucket: ':bucket', id: ':id', title: 'KV' });

	function getStorage(req, res) {
		switch (req.pathArgs.storage) {
			case 'session': req.storage = sessionStorage; break;
			case 'local': req.storage = localStorage; break;
			default: throw 404;
		}
		req.key = 'storage_'+req.pathArgs.bucket+':'+req.pathArgs.id;
		return true;
	}

	method('HEAD', checkPerms, getStorage, function(req, res) {
		if (!req.storage.getItem(req.key))
			return 404;
		return 204;
	});

	method('GET', checkPerms, getStorage, function(req, res) {
		var value = req.storage.getItem(req.key);
		if (!value)
			throw 404;
		return [200, value];
	});

	method('PUT', checkPerms, getStorage, function(req, res) {
		req.assert({ type: 'text/plain' });
		req.storage.setItem(req.key, req.body);
		return 204;
	});

	method('DELETE', checkPerms, getStorage, function(req, res) {
		req.storage.removeItem(req.key);
		return 204;
	});
});