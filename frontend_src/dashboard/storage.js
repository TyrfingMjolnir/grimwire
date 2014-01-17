/*
httpl://storage

Simple local/session storage server
*/

var server = servware();
module.exports = server;

function checkPerms(req, res) {
	var from = req.header('From');
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
	link({ href: '/', rel: 'self service', id: 'storage', title: 'KVStore', hidden: true });
	link({ href: '/{bucket}{?storage}', rel: 'collection', title: 'KV Bucket', hidden: true });
	link({ href: '/{bucket}/{key}{?storage}', rel: 'item', title: 'KV', hidden: true });

	method('HEAD', checkPerms, function() { return 204; });
});

server.route('/:bucket', function(link, method) {
	link({ href: 'httpl://hosts', rel: 'via', id: 'hosts', title: 'Page' });

	method('HEAD', checkPerms, function(req, res) {
		if (req.query.storage) {
			var s = encodeURIComponent(req.query.storage);
			res.link({ href: '/:bucket?storage='+s, rel: 'self collection', bucket: ':bucket', storage: req.query.storage, title: 'KV Bucket: :bucket' });
			res.link({ href: '/:bucket/{key}?storage='+s, rel: 'item', bucket: ':bucket', storage: req.query.storage, title: 'KV', hidden: true });
		}
		res.link({ href: '/:bucket{?storage}', rel: 'self collection', bucket: ':bucket', title: 'KV Bucket: :bucket' });
		res.link({ href: '/:bucket/{key}{?storage}', rel: 'item', bucket: ':bucket', title: 'KV', hidden: true });
		return 204;
	});
});

server.route('/:bucket/:key', function(link, method) {
	link({ href: 'httpl://hosts', rel: 'via', id: 'hosts', title: 'Page' });

	function setLinks(req, res) {
		if (req.query.storage) {
			var s = encodeURIComponent(req.query.storage);
			res.link({ href: '/:bucket?storage='+s, rel: 'up collection', bucket: ':bucket', storage: req.query.storage, title: 'KV Bucket: :bucket' });
			res.link({ href: '/:bucket/:key?storage='+s, rel: 'self item', bucket: ':bucket', id: ':key', storage: req.query.storage, title: 'KV' });
		}
		res.link({ href: '/:bucket{?storage}', rel: 'up collection', bucket: ':bucket', title: 'KV Bucket: :bucket' });
		res.link({ href: '/:bucket/:key{?storage}', rel: 'self item', bucket: ':bucket', key: ':key', title: 'KV' });
		return true;
	}

	function getStorage(req, res) {
		switch (req.query.storage) {
			case 'session':
				req.storage = sessionStorage; break;
			case 'local':
			default:
				req.storage = localStorage; break;
		}
		req.bucket_key = 'storage_'+req.pathArgs.bucket;
		req.item_key = req.bucket_key+':'+req.pathArgs.key;
		return true;
	}

	method('HEAD', checkPerms, setLinks, getStorage, function(req, res) {
		if (!req.storage.getItem(req.item_key))
			return 404;
		return 204;
	});

	method('GET', checkPerms, setLinks, getStorage, function(req, res) {
		var value = req.storage.getItem(req.item_key);
		if (!value)
			throw 404;
		return [200, value];
	});

	method('PUT', checkPerms, setLinks, getStorage, function(req, res) {
		req.assert({ type: 'text/plain' });

		// Store
		req.storage.setItem(req.item_key, req.body);

		// Book-keep the collection
		var bucket;
		try { bucket = JSON.parse(req.storage.getItem(req.bucket_key)) || []; }
		catch(e) { bucket = []; }
		if (bucket.indexOf(req.pathArgs.key) === -1) {
			bucket.push(req.pathArgs.key);
			req.storage.setItem(req.bucket_key, JSON.stringify(bucket));
		}

		return 204;
	});

	method('DELETE', checkPerms, setLinks, getStorage, function(req, res) {
		// Delete
		req.storage.removeItem(req.item_key);

		// Book-keep the collection
		var bucket;
		try { bucket = JSON.parse(req.storage.getItem(req.bucket_key)) || []; }
		catch(e) { bucket = []; }
		var index = bucket.indexOf(req.pathArgs.key);
		if (index !== -1) {
			bucket.splice(index, 1);
			req.storage.setItem(req.bucket_key, JSON.stringify(bucket));
		}

		return 204;
	});
});