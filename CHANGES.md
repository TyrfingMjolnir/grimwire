Changes
=======
0.5.1

2013/11/25 pfraze

 - Added `config.defaultOpen` to grimwidget


2013/11/22 pfraze

 - Added `config.width` to grimwidget
 - Added `opts.useCache` to grimwidget refresh function


2013/11/21 pfraze

 - Fix: grimwidget now correctly emits request events on anchors.


0.5.0
=====

2013/11/17 pfraze

 - Added ?link_bodies to users list route as a simpler way to render users' submitted links


2013/11/15 pfraze

 - Updated gwr.io protocols to no longer combine semantics (gwr.io/user item -> gwr.io/user/item)


2013/11/14 pfraze

 - Altered peer URI scheme to support ports in relay and application hosts
 - Improved start|stop to autoclean pidfiles that don't point to active processes
 - Standardized 422 error responses
 - Added a config option for server user # limit


2013/11/12 pfraze

 - Added guest accounts


2013/11/11 pfraze

 - Added per-user stream limits (default 10)
 - Removed '-' character from allowed usernames (will be a special separator for guest accounts)
 - Fix: signup form now correctly displays 422 errors.


0.4.0 - initial release