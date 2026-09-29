import {API_VERSIONS} from './integration-domain.js';
export function integrationConfig(env=process.env,origin=env.APP_ORIGIN||'http://localhost:3000'){
 return {googleAds:{clientId:env.GOOGLE_ADS_CLIENT_ID||'',clientSecret:env.GOOGLE_ADS_CLIENT_SECRET||'',redirectURI:origin+'/api/integrations/google-ads/callback',version:env.GOOGLE_ADS_API_VERSION||API_VERSIONS.google},metaAds:{clientId:env.META_APP_ID||'',clientSecret:env.META_APP_SECRET||'',redirectURI:origin+'/api/integrations/meta-ads/callback',version:env.META_API_VERSION||API_VERSIONS.meta}};
}
