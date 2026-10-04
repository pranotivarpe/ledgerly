import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthLayout } from './auth-layout';

export function SignupPage() {
  return (
    <AuthLayout
      title="Create your workspace"
      description="Start on the free plan. Upgrade whenever you're ready."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </>
      }
    >
      {/* Wired up to the auth API in Phase 2 */}
      <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        <div className="space-y-2">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" autoComplete="name" placeholder="Alex Morgan" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="org">Agency name</Label>
          <Input id="org" autoComplete="organization" placeholder="Northwind Studio" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@agency.com"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" minLength={8} required />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <Button type="submit" className="w-full">
          Create workspace
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          By signing up you agree to the Terms and Privacy Policy.
        </p>
      </form>
    </AuthLayout>
  );
}
