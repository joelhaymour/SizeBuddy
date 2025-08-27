import { useAppBridge } from '@shopify/app-bridge-react';
import { authenticatedFetch } from '@shopify/app-bridge-utils';
import { useCallback } from 'react';

/**
 * A hook that returns a fetch function that works with Shopify's authentication flow
 * This adds the Authorization header and properly handles redirects
 */
export function useSizeBuddyFetch() {
  const app = useAppBridge();
  
  return useCallback(
    function fetchFunction(uri, options = {}) {
      const fetch = authenticatedFetch(app);
      
      // Don't try to add headers for preflight requests
      if (options.method === 'OPTIONS') {
        return fetch(uri, options);
      }
      
      const headers = options.headers || {};
      
      return fetch(uri, {
        ...options,
        headers: {
          ...headers,
          'Content-Type': headers['Content-Type'] || 'application/json',
          'Accept': 'application/json',
        },
      });
    }, 
    [app]
  );
} 