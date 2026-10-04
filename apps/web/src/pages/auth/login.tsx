import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthLayout } from './auth-layout';

export function LoginPage() {
  return (
    <AuthLayout
      title="Welcome back"
      description="Log in to your Ledgerly workspace."
      footer={
        <>
          New to Ledgerly?{' '}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {/* Wired up to the auth API in Phase 2 */}
      <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
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
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              to="/forgot-password"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Forgot password?
            </Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" required />
        </div>
        <Button type="submit" className="w-full">
          Log in
        </Button>
      </form>
    </AuthLayout>
  );
}
