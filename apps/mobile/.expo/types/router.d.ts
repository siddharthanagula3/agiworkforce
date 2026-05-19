/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string | object = string> {
      hrefInputParams:
        | { pathname: Router.RelativePathString; params?: Router.UnknownInputParams }
        | { pathname: Router.ExternalPathString; params?: Router.UnknownInputParams }
        | { pathname: '/(app)'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/(tabs)/chat'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/(tabs)/agents'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/(tabs)/projects'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/(tabs)/settings'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/agents'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/agents/[id]'; params: { id: string } }
        | { pathname: '/(app)/chat/[id]'; params: { id: string } }
        | { pathname: '/(app)/companion'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/companion/agent/[agentId]'; params: { agentId: string } }
        | { pathname: '/(app)/companion/agent/[id]'; params: { id: string } }
        | { pathname: '/(app)/schedules'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/schedules/create'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/notifications'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/share-preview'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/about'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/camera'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/compare'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/feedback'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/usage'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/widget-setup'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/connectors'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/dispatch'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/messaging'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/profile'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/skills'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/settings'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/settings/auto-approve'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/settings/capabilities'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/settings/integrations'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/settings/memory'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/settings/notifications'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/settings/personalization'; params?: Router.UnknownInputParams }
        | { pathname: '/(auth)/login'; params?: Router.UnknownInputParams }
        | { pathname: '/(auth)/reset-password'; params?: Router.UnknownInputParams }
        | { pathname: '/(public)/onboarding'; params?: Router.UnknownInputParams };
      hrefOutputParams:
        | { pathname: Router.RelativePathString; params?: Router.UnknownOutputParams }
        | { pathname: Router.ExternalPathString; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/(tabs)/chat'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/(tabs)/agents'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/(tabs)/projects'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/(tabs)/settings'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/agents'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/agents/[id]'; params: { id: string } }
        | { pathname: '/(app)/chat/[id]'; params: { id: string } }
        | { pathname: '/(app)/companion'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/companion/agent/[agentId]'; params: { agentId: string } }
        | { pathname: '/(app)/companion/agent/[id]'; params: { id: string } }
        | { pathname: '/(app)/schedules'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/schedules/create'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/notifications'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/share-preview'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/about'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/camera'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/compare'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/feedback'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/usage'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/widget-setup'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/connectors'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/dispatch'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/messaging'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/profile'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/skills'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/settings'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/settings/auto-approve'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/settings/capabilities'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/settings/integrations'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/settings/memory'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/settings/notifications'; params?: Router.UnknownOutputParams }
        | { pathname: '/(app)/settings/personalization'; params?: Router.UnknownOutputParams }
        | { pathname: '/(auth)/login'; params?: Router.UnknownOutputParams }
        | { pathname: '/(auth)/reset-password'; params?: Router.UnknownOutputParams }
        | { pathname: '/(public)/onboarding'; params?: Router.UnknownOutputParams };
      href:
        | Router.RelativePathString
        | Router.ExternalPathString
        | '/(app)'
        | '/(app)/(tabs)/chat'
        | '/(app)/(tabs)/agents'
        | '/(app)/(tabs)/projects'
        | '/(app)/(tabs)/settings'
        | '/(app)/agents'
        | '/(app)/about'
        | '/(app)/camera'
        | '/(app)/compare'
        | '/(app)/feedback'
        | '/(app)/usage'
        | '/(app)/widget-setup'
        | '/(app)/companion'
        | '/(app)/schedules'
        | '/(app)/schedules/create'
        | '/(app)/notifications'
        | '/(app)/share-preview'
        | '/(app)/connectors'
        | '/(app)/dispatch'
        | '/(app)/messaging'
        | '/(app)/profile'
        | '/(app)/skills'
        | '/(app)/settings'
        | '/(app)/settings/auto-approve'
        | '/(app)/settings/capabilities'
        | '/(app)/settings/integrations'
        | '/(app)/settings/memory'
        | '/(app)/settings/notifications'
        | '/(app)/settings/personalization'
        | '/(auth)/login'
        | '/(auth)/reset-password'
        | '/(public)/onboarding'
        | { pathname: '/(app)'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/(tabs)/chat'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/(tabs)/agents'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/(tabs)/projects'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/(tabs)/settings'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/agents'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/agents/[id]'; params: { id: string } }
        | { pathname: '/(app)/chat/[id]'; params: { id: string } }
        | { pathname: '/(app)/companion'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/companion/agent/[agentId]'; params: { agentId: string } }
        | { pathname: '/(app)/companion/agent/[id]'; params: { id: string } }
        | { pathname: '/(app)/schedules'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/schedules/create'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/notifications'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/share-preview'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/about'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/camera'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/compare'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/feedback'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/usage'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/widget-setup'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/connectors'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/dispatch'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/messaging'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/profile'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/skills'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/settings'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/settings/auto-approve'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/settings/capabilities'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/settings/integrations'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/settings/memory'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/settings/notifications'; params?: Router.UnknownInputParams }
        | { pathname: '/(app)/settings/personalization'; params?: Router.UnknownInputParams }
        | { pathname: '/(auth)/login'; params?: Router.UnknownInputParams }
        | { pathname: '/(auth)/reset-password'; params?: Router.UnknownInputParams }
        | { pathname: '/(public)/onboarding'; params?: Router.UnknownInputParams };
    }
  }
}
