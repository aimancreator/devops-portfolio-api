FROM node:24-alpine
ENV NODE_ENV=production PORT=4000 HOST=0.0.0.0
WORKDIR /app
COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node data ./data
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:4000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
