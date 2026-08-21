FROM nginx:1.27-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY web/public /usr/share/nginx/html

RUN mkdir -p /usr/share/nginx/html/data

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -Y off -O /dev/null http://127.0.0.1/healthz || exit 1
