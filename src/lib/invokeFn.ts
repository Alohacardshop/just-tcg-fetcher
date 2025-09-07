import { supabase } from './supabaseClient';

export interface InvokeFnResult<T = unknown> {
  data?: T;
  error?: any;
  status: number;
}

export async function invokeFn<T = unknown>(
  name: string, 
  body?: any,
  retryOnAuth = true
): Promise<InvokeFnResult<T>> {
  try {
    // Always attach a Bearer token: user access token if present, otherwise the anon key
    const { data: sess } = await supabase.auth.getSession();
    const accessToken = sess?.session?.access_token ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqeXdjeWhucHpxZ3Bvd3dycHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwOTI2ODIsImV4cCI6MjA3MjY2ODY4Mn0.Hq0zKaJaWhNR4WLnqM4-UelgRFEPEFi_sk6p7CzqSEA';
    
    console.log('Invoking function:', { name, hasUserToken: !!sess?.session?.access_token });
    
    const { data, error } = await supabase.functions.invoke(name, {
      body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqeXdjeWhucHpxZ3Bvd3dycHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwOTI2ODIsImV4cCI6MjA3MjY2ODY4Mn0.Hq0zKaJaWhNR4WLnqM4-UelgRFEPEFi_sk6p7CzqSEA'
      }
    });

    const status = error?.status ?? 200;
    
    // Handle auth errors
    if (status === 401 || error?.message?.includes('Invalid JWT')) {
      console.warn('Auth error detected:', { status, error });
      
      if (retryOnAuth) {
        // Try to refresh session and retry once
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError) {
          console.log('Session refreshed, retrying function call');
          return invokeFn<T>(name, body, false); // Retry without further retries
        }
      }
      
      return {
        data: undefined,
        error: {
          ...error,
          authError: true,
          message: 'Your session has expired. Please sign in and try again.'
        },
        status: 401
      };
    }

    return {
      data: data as T,
      error,
      status
    };

  } catch (err: any) {
    console.error('Function invocation error:', err);
    return {
      data: undefined,
      error: {
        message: err.message || 'Network error',
        networkError: true
      },
      status: 500
    };
  }
}

export async function checkAuthStatus(): Promise<{ 
  isAuthenticated: boolean; 
  user: any; 
  needsSignIn: boolean 
}> {
  const { data: { session } } = await supabase.auth.getSession();
  
  return {
    isAuthenticated: !!session?.user,
    user: session?.user || null,
    needsSignIn: !session?.access_token
  };
}