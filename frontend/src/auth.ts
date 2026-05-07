import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

// Vercel injects VERCEL_URL automatically (e.g. "my-app.vercel.app", no protocol).
// If AUTH_URL is still pointing at localhost (from a copied .env), override it here.
if (process.env.VERCEL_URL && process.env.AUTH_URL?.includes("localhost")) {
  process.env.AUTH_URL = `https://${process.env.VERCEL_URL}`;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  trustHost: true,
  pages: {
    signIn: "/login",
    error:  "/login",
  },
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
})
