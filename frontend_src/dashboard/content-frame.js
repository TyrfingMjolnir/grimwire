
var common = require('./common');
var contentFrame = module.exports = {};

var current_content_origin = null;
var $chrome_url = $('#chrome-url');
var $chrome_back = $('#chrome-back');
var $chrome_forward = $('#chrome-forward');
var $chrome_refresh = $('#chrome-refresh');
var chrome_history = [];
var chrome_history_position = -1;

function goBack() {
	chrome_history_position--;
	if (chrome_history_position < 0) {
		chrome_history_position = 0;
		return false;
	}
}

function goForward() {
	chrome_history_position++;
	if (chrome_history_position >= chrome_history.length) {
		chrome_history_position = chrome_history.length - 1;
		return false;
	}
}

function renderFromCache(pos) {
	pos = (typeof pos == 'undefined') ? chrome_history_position : pos;
	var history = chrome_history[pos];

	// Update nav state
	$chrome_url.val(history.url);
	window.location.hash = chrome_history[chrome_history_position].url;
	current_content_origin = history.origin;
	console.debug('new origin', current_content_origin);

	// Render HTML
	var html = '<link href="css/bootstrap.css" rel="stylesheet"><link href="css/dashboard.css" rel="stylesheet"><link href="css/iframe.css" rel="stylesheet">'+history.html;
	var $iframe = $('main iframe');
	$iframe.contents().find('body').html(common.sanitizeHtml(html));
	// $('main').html(history.html);
}

contentFrame.setupChromeUI = function() {
	$chrome_back.on('click', function() {
		goBack();
		renderFromCache();
		return false;
	});
	$chrome_forward.on('click', function() {
		goForward();
		renderFromCache();
		return false;
	});
	$chrome_refresh.on('click', function() {
		contentFrame.dispatchRequest({ method: 'GET', url: $chrome_url.val(), target: '_content' }, null, { is_refresh: true });
		return false;
	});
	$chrome_url.on('keydown', function(e) {
		if (e.which === 13) {
			contentFrame.dispatchRequest({ method: 'GET', url: $chrome_url.val(), target: '_content' });
		}
	});
};

contentFrame.prepIframeRequest = function (req) {
	if (current_content_origin) {
		// Clear the headers we're going to set
		delete req.headers['From'];
		delete req.headers['from'];

		// Put origin into the headers
		req.headers['From'] = current_content_origin;
	}
};


// Iframe Behaviors
var $iframe = $('main iframe');
local.bindRequestEvents($iframe.contents()[0].body);
$iframe.contents()[0].body.addEventListener('request', function(e) {
	var req = e.detail;
	contentFrame.prepIframeRequest(req);
	contentFrame.dispatchRequest(req, e.target);
});

// Page dispatch behavior
contentFrame.dispatchRequest = function(req, origin, opts) {
	opts = opts || {};
	// Relative link? Use context to make absolute
	if (!local.isAbsUri(req.url)) {
		req.url = local.joinUri(current_content_origin, req.url);
	}

	// Content target? Update page
	if (req.target == '_content' || req.target == '_card_group' || req.target == '_card_self') {
		if ((!req.headers || !req.headers.accept) && !req.Accept) { req.Accept = 'text/html, */*'; }
		return local.dispatch(req).always(function(res) {
			/*if ([301, 302, 303, 305].indexOf(res.status) !== -1) {
				if (res.headers.location) {
					return contentFrame.dispatchRequest({ method: 'GET', url: res.headers.location, target: '_content' }, origin);
				}
				console.error('Redirect response is missing its location header');
			}*/

			// Generate final html
			var html;
			if (res.body && typeof res.body == 'string') {
				html = res.body;
				if (res.Content_Type != 'text/html') {
					html = '<pre class="plain">'+html+'</pre>';
				}
			} else {
				html = '<h1>'+(+res.status)+' <small>'+(res.reason||'').replace(/</g,'&lt;')+'</small></h1>';
				if (res.body && typeof res.body != 'string') { html += '<pre class="plain">'+JSON.stringify(res.body).replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</pre>'; }
			}

			// Update history
			$('#chrome-url').val(decodeURIComponent(req.url));
			if (opts.is_refresh && chrome_history[chrome_history_position] && chrome_history[chrome_history_position].url == req.url) {
				// Just update HTML in cache
				chrome_history[chrome_history_position].html = html;
			} else {
				// Expand/reduce the history to include 1 open slot
				if (chrome_history.length > (chrome_history_position+1)) {
					chrome_history.length = chrome_history_position+1;
				}

				// Set origin
				var urld = local.parseUri(req);
				var origin = (urld.protocol || 'httpl')+'://'+urld.authority;
				if (res.headers['x-origin']) { // verified in response.processHeaders()
					origin = res.headers['x-origin'];
				}
				chrome_history.push({ url: req.url, html: html, origin: origin });
				chrome_history_position++;

				// Reset view
				if (res.status == 205) {
					goBack();
				}
			}

			// Render
			renderFromCache();

			return res;
		});

		/*.fail(function(res) {
			if (res.status == 422 && e.target.tagName == 'FORM' && res.body) {
				// Bad ent - fill errors
				var $form = $(e.target);
				$('.has-error', $form).removeClass('has-error');
				for (var k in res.body) {
					$('[name='+k+']', $form).parent('.form-group').addClass('has-error');
					$('#'+k+'-error', $form).html(res.body[k]);
				}
			}
			throw res;
		});*/
	}

	// No special target? Simple dispatch
	return local.dispatch(req);
};

window.onhashchange = function() {
	// Try to find this URI in proximate history
	var hashurl = window.location.hash.slice(1) || 'httpl://feed';
	for (var pos = chrome_history_position-1; pos < (chrome_history_position+1); pos++) {
		if (chrome_history[pos] && chrome_history[pos].url === hashurl) {
			if (chrome_history_position == pos) return;
			chrome_history_position = pos;
			renderFromCache();
			return;
		}
	}
	// Not in history, new request
	contentFrame.dispatchRequest(hashurl);
};