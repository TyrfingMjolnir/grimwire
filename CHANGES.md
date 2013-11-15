Changes
=======
0.4.1

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