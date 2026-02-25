import { query } from "./_generated/server";
import { auth } from "./auth";

export const debugAuth = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    console.log("[Debug] getUserId result:", userId);
    if (!userId) {
      return { authenticated: false, userId: null, user: null };
    }
    const user = await ctx.db.get(userId);
    console.log("[Debug] user:", user ? "found" : "not found");
    return {
      authenticated: true,
      userId: userId.toString(),
      user: user ? { name: user.name, username: user.username, email: user.email } : null,
    };
  },
});
