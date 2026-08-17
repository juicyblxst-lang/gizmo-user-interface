import server from "../src/server";

export default {
  fetch(request: Request) {
    return server.fetch(request, undefined, undefined);
  },
};
