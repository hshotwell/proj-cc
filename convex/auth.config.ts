export default {
  providers: [
    {
      domain: process.env.SITE_URL ?? "http://localhost:3000",
      applicationID: "convex",
    },
  ],
};
