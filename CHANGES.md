Changes
=======
0.5.2

2013/12/09 pfraze

 - Added forgot password, update password, and update email interfaces with email-confirmation flow


2013/12/07 pfraze

 - Lowercased all usernames on signup
 - Replaced grimwidget guests with account creation


0.5.1
=====

2013/12/05 pfraze

 - Altered peer URI semantics to always refer to the 4th item as the 'sid' (instead of the ambiguous 'stream' or 'streamId')
 - Simplified gwr.io reltypes


2013/12/03 pfraze

 - Added CORS caching header to reduce preflights dramatically
 - Extended sessions from 1 day to 7


2013/12/01 pfraze

 - Added `config.renderLabel` to grimwidget


2013/11/25 pfraze

 - Added `config.defaultOpen` and `config.valign` to grimwidget


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