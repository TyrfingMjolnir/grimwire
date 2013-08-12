#!/bin/sh

mkdir modules
cd modules

git clone https://github.com/simpl/ngx_devel_kit.git

git clone https://github.com/agentzh/array-var-nginx-module.git

git clone https://github.com/FRiCKLE/ngx_coolkit.git

git clone https://github.com/agentzh/rds-json-nginx-module.git

git clone https://github.com/agentzh/xss-nginx-module.git

wget -O ngx_http_auth_request_module.tar.gz http://mdounin.ru/hg/ngx_http_auth_request_module/archive/tip.tar.gz
tar -xzvf ngx_http_auth_request_module.tar.gz
mv ngx_http_auth_request_module-* ngx_http_auth_request_module

git clone https://github.com/agentzh/echo-nginx-module.git

git clone http://github.com/calio/form-input-nginx-module.git

git clone https://github.com/agentzh/headers-more-nginx-module.git

git clone https://github.com/FRiCKLE/ngx_postgres.git

git clone https://github.com/agentzh/set-misc-nginx-module.git

cd ..

./configure \
--with-http_ssl_module \
--with-http_stub_status_module \
--add-module=modules/ngx_devel_kit \
--add-module=modules/array-var-nginx-module \
--add-module=modules/ngx_coolkit \
--add-module=modules/rds-json-nginx-module \
--add-module=modules/xss-nginx-module \
--add-module=modules/ngx_http_auth_request_module \
--add-module=modules/echo-nginx-module \
--add-module=modules/form-input-nginx-module \
--add-module=modules/headers-more-nginx-module \
--add-module=modules/ngx_postgres \
--add-module=modules/set-misc-nginx-module