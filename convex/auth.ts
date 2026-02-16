import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

const CustomPassword = Password({
  profile(params) {
    return {
      email: params.email as string,
      name: (params.name as string) || (params.email as string).split("@")[0],
    };
  },
  validatePasswordRequirements(password) {
    if (typeof password !== "string") throw new Error("Password is required");
    if (password.length < 8)
      throw new Error("Password must be at least 8 characters");
    if (password.length > 128)
      throw new Error("Password must be 128 characters or less");
    if (!/[a-z]/.test(password))
      throw new Error("Password must contain at least one lowercase letter");
    if (!/[A-Z]/.test(password))
      throw new Error("Password must contain at least one uppercase letter");
    if (!/[0-9]/.test(password))
      throw new Error("Password must contain at least one number");
  },
});

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [CustomPassword],
});
