import React, { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { UserPlus, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { safeReturnTo } from "@/lib/authReturnTo";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const googleEnabled = import.meta.env.VITE_SUPABASE_GOOGLE_ENABLED === 'true';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      if (data.session) window.location.href = safeReturnTo();
      else setRegistered(true);
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: new URL(safeReturnTo(), window.location.origin).toString() },
    });
    if (error) setError(error.message);
  };

  if (registered) {
    return (
      <AuthLayout
        icon={Mail}
        title="Check your email"
        subtitle={`Confirm your account using the link sent to ${email}`}
        footer={<Link to="/login" className="text-primary font-medium hover:underline">Back to log in</Link>}
      >
        <p className="text-sm text-foreground text-center">Open the confirmation email to finish creating your account, then return here to log in.</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={UserPlus}
      title="Create your account"
      subtitle="Sign up to get started"
      footer={
        <>
          Already have an account?{" "}
          <Link
            to={"/login" + (safeReturnTo() !== "/" ? "?returnTo=" + encodeURIComponent(safeReturnTo()) : "")}
            className="text-primary font-medium hover:underline"
          >
            Log in
          </Link>
        </>
      }
    >
      {googleEnabled && <button
        className="w-full h-12 text-sm font-medium mb-6 rounded-md border border-input bg-background hover:bg-accent"
        onClick={handleGoogle}
      >
        <GoogleIcon className="w-5 h-5 mr-2" />
        Continue with Google
      </button>}

      {googleEnabled && <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">or</span>
        </div>
      </div>}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">Email</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="confirm" className="text-sm font-medium">Confirm Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <button type="submit" className="w-full h-12 font-medium rounded-md bg-primary text-primary-foreground" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
