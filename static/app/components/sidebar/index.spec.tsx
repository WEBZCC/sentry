import type {UseQueryResult} from '@tanstack/react-query';
import {BroadcastFixture} from 'sentry-fixture/broadcast';
import {LocationFixture} from 'sentry-fixture/locationFixture';
import {OrganizationFixture} from 'sentry-fixture/organization';
import {ServiceIncidentFixture} from 'sentry-fixture/serviceIncident';
import {UserFixture} from 'sentry-fixture/user';

import {act, render, screen, userEvent, waitFor} from 'sentry-test/reactTestingLibrary';

import {OnboardingContextProvider} from 'sentry/components/onboarding/onboardingContext';
import SidebarContainer from 'sentry/components/sidebar';
import ConfigStore from 'sentry/stores/configStore';
import type {Organization, StatuspageIncident} from 'sentry/types';
import {useLocation} from 'sentry/utils/useLocation';
import * as incidentsHook from 'sentry/utils/useServiceIncidents';

jest.mock('sentry/utils/useServiceIncidents');
jest.mock('sentry/utils/useLocation');

const mockUseLocation = jest.mocked(useLocation);

const sidebarAccordionFeatures = [
  'performance-view',
  'performance-database-view',
  'performance-cache-view',
  'performance-http',
];

describe('Sidebar', function () {
  const organization = OrganizationFixture();
  const broadcast = BroadcastFixture();
  const user = UserFixture();
  const apiMocks = {
    broadcasts: jest.fn(),
    broadcastsMarkAsSeen: jest.fn(),
    sdkUpdates: jest.fn(),
  };

  const getElement = () => (
    <OnboardingContextProvider>
      <SidebarContainer />
    </OnboardingContextProvider>
  );

  const renderSidebar = ({organization: org}: {organization: Organization | null}) =>
    render(getElement(), {organization: org});

  beforeEach(function () {
    mockUseLocation.mockReset();
    jest.spyOn(incidentsHook, 'useServiceIncidents').mockImplementation(
      () =>
        ({
          data: [ServiceIncidentFixture()],
        }) as UseQueryResult<StatuspageIncident[]>
    );

    apiMocks.broadcasts = MockApiClient.addMockResponse({
      url: `/organizations/${organization.slug}/broadcasts/`,
      body: [broadcast],
    });
    apiMocks.broadcastsMarkAsSeen = MockApiClient.addMockResponse({
      url: '/broadcasts/',
      method: 'PUT',
    });
    apiMocks.sdkUpdates = MockApiClient.addMockResponse({
      url: `/organizations/${organization.slug}/sdk-updates/`,
      body: [],
    });
  });

  it('renders', async function () {
    renderSidebar({organization});
    expect(await screen.findByTestId('sidebar-dropdown')).toBeInTheDocument();
  });

  it('renders without org', async function () {
    renderSidebar({organization: null});

    // no org displays user details
    expect(await screen.findByText(user.name)).toBeInTheDocument();
    expect(screen.getByText(user.email)).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('sidebar-dropdown'));
  });

  it('renders for self-hosted errors only', async function () {
    act(() => void ConfigStore.set('isSelfHostedErrorsOnly', true));
    const {container} = renderSidebar({organization});
    expect(await screen.findByTestId('sidebar-dropdown')).toBeInTheDocument();
    const sidebarItems = container.querySelectorAll('[id^="sidebar-item"]');
    const sidebarItemIds = Array.from(sidebarItems).map(sidebarItem => sidebarItem.id);
    expect(sidebarItems.length).toEqual(10);
    expect(sidebarItemIds).toEqual([
      'sidebar-item-issues',
      'sidebar-item-projects',
      'sidebar-item-alerts',
      'sidebar-item-releases',
      'sidebar-item-stats',
      'sidebar-item-settings',
      'sidebar-item-help',
      'sidebar-item-broadcasts',
      'sidebar-item-statusupdate',
      'sidebar-item-collapse',
    ]);
    act(() => void ConfigStore.set('isSelfHostedErrorsOnly', false));
  });

  it('has can logout', async function () {
    const mock = MockApiClient.addMockResponse({
      url: '/auth/',
      method: 'DELETE',
      status: 204,
    });
    jest.spyOn(window.location, 'assign').mockImplementation(() => {});

    renderSidebar({
      organization: OrganizationFixture({access: ['member:read']}),
    });

    await userEvent.click(await screen.findByTestId('sidebar-dropdown'));
    await userEvent.click(screen.getByTestId('sidebar-signout'));

    await waitFor(() => expect(mock).toHaveBeenCalled());

    expect(window.location.assign).toHaveBeenCalledWith('/auth/login/');
  });

  it('can toggle help menu', async function () {
    renderSidebar({organization});
    await userEvent.click(await screen.findByText('Help'));

    expect(screen.getByText('Visit Help Center')).toBeInTheDocument();
  });

  describe('SidebarDropdown', function () {
    it('can open Sidebar org/name dropdown menu', async function () {
      renderSidebar({organization});

      await userEvent.click(await screen.findByTestId('sidebar-dropdown'));

      const orgSettingsLink = screen.getByText('Organization settings');
      expect(orgSettingsLink).toBeInTheDocument();
    });
    it('has link to Members settings with `member:write`', async function () {
      renderSidebar({
        organization: OrganizationFixture({access: ['member:read']}),
      });

      await userEvent.click(await screen.findByTestId('sidebar-dropdown'));

      expect(screen.getByText('Members')).toBeInTheDocument();
    });

    it('can open "Switch Organization" sub-menu', async function () {
      act(() => void ConfigStore.set('features', new Set(['organizations:create'])));

      renderSidebar({organization});

      await userEvent.click(await screen.findByTestId('sidebar-dropdown'));

      jest.useFakeTimers();
      await userEvent.hover(screen.getByText('Switch organization'), {delay: null});
      act(() => jest.advanceTimersByTime(500));
      jest.useRealTimers();

      const createOrg = screen.getByText('Create a new organization');
      expect(createOrg).toBeInTheDocument();
    });
  });

  describe('SidebarPanel', function () {
    it('hides when path changes', async function () {
      const {rerender} = renderSidebar({organization});

      await userEvent.click(await screen.findByText("What's new"));
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText("What's new in Sentry")).toBeInTheDocument();

      mockUseLocation.mockReturnValue({...LocationFixture(), pathname: '/other/path'});
      rerender(getElement());
      expect(screen.queryByText("What's new in Sentry")).not.toBeInTheDocument();
    });

    it('can have onboarding feature', async function () {
      renderSidebar({
        organization: {...organization, features: ['onboarding']},
      });

      const quickStart = await screen.findByText('Quick Start');

      expect(quickStart).toBeInTheDocument();
      await userEvent.click(quickStart);

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Capture your first error')).toBeInTheDocument();

      await userEvent.click(quickStart);
      expect(screen.queryByText('Capture your first error')).not.toBeInTheDocument();
      await tick();
    });

    it('displays empty panel when there are no Broadcasts', async function () {
      MockApiClient.addMockResponse({
        url: `/organizations/${organization.slug}/broadcasts/`,
        body: [],
      });
      renderSidebar({organization});

      await userEvent.click(await screen.findByText("What's new"));

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText("What's new in Sentry")).toBeInTheDocument();
      expect(
        screen.getByText('No recent updates from the Sentry team.')
      ).toBeInTheDocument();

      // Close the sidebar
      await userEvent.click(screen.getByText("What's new"));
      expect(screen.queryByText("What's new in Sentry")).not.toBeInTheDocument();
      await tick();
    });

    it('can display Broadcasts panel and mark as seen', async function () {
      jest.useFakeTimers();
      renderSidebar({organization});

      expect(apiMocks.broadcasts).toHaveBeenCalled();

      await userEvent.click(await screen.findByText("What's new"), {delay: null});

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText("What's new in Sentry")).toBeInTheDocument();

      const broadcastTitle = screen.getByText(broadcast.title);
      expect(broadcastTitle).toBeInTheDocument();

      // Should mark as seen after a delay
      act(() => jest.advanceTimersByTime(2000));

      expect(apiMocks.broadcastsMarkAsSeen).toHaveBeenCalledWith(
        '/broadcasts/',
        expect.objectContaining({
          data: {hasSeen: '1'},
          query: {id: ['8']},
        })
      );
      jest.useRealTimers();

      // Close the sidebar
      await userEvent.click(screen.getByText("What's new"));
      expect(screen.queryByText("What's new in Sentry")).not.toBeInTheDocument();
      await tick();
    });

    it('can unmount Sidebar (and Broadcasts) and kills Broadcast timers', async function () {
      jest.useFakeTimers();
      const {unmount} = renderSidebar({organization});

      // This will start timer to mark as seen
      await userEvent.click(await screen.findByRole('link', {name: "What's new"}), {
        delay: null,
      });
      expect(await screen.findByText("What's new in Sentry")).toBeInTheDocument();

      act(() => jest.advanceTimersByTime(500));

      // Unmounting will cancel timers
      unmount();

      // This advances timers enough so that mark as seen should be called if
      // it wasn't unmounted
      act(() => jest.advanceTimersByTime(600));
      expect(apiMocks.broadcastsMarkAsSeen).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('can show Incidents in Sidebar Panel', async function () {
      renderSidebar({organization});

      await userEvent.click(await screen.findByText('Service status'));
      await screen.findByText('Recent service updates');
    });
  });

  it('can toggle collapsed state', async function () {
    renderSidebar({organization});

    expect(await screen.findByText(user.name)).toBeInTheDocument();
    expect(screen.getByText(organization.name)).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('sidebar-collapse'));

    // Check that the organization name is no longer visible
    expect(screen.queryByText(organization.name)).not.toBeInTheDocument();

    // Un-collapse he sidebar and make sure the org name is visible again
    await userEvent.click(screen.getByTestId('sidebar-collapse'));
    expect(await screen.findByText(organization.name)).toBeInTheDocument();
  });

  describe('when the accordion is used', () => {
    const renderSidebarWithFeatures = (features: string[] = []) => {
      return renderSidebar({
        organization: {
          ...organization,
          features: [...organization.features, ...sidebarAccordionFeatures, ...features],
        },
      });
    };

    it('renders sidebar with features', async function () {
      const {container} = renderSidebarWithFeatures();
      expect(await screen.findByTestId('sidebar-dropdown')).toBeInTheDocument();
      const sidebarItems = container.querySelectorAll('[id^="sidebar-item"]');
      const sidebarItemIds = Array.from(sidebarItems).map(sidebarItem => sidebarItem.id);
      expect(sidebarItems.length).toEqual(12);
      expect(sidebarItemIds).toEqual([
        'sidebar-item-issues',
        'sidebar-item-projects',
        'sidebar-item-sidebar-accordion-performance-item',
        'sidebar-item-crons',
        'sidebar-item-alerts',
        'sidebar-item-releases',
        'sidebar-item-stats',
        'sidebar-item-settings',
        'sidebar-item-help',
        'sidebar-item-broadcasts',
        'sidebar-item-statusupdate',
        'sidebar-item-collapse',
      ]);
    });

    it('renders new sidebar hierarchy', async function () {
      const {container} = renderSidebarWithFeatures([
        'performance-insights',
        'insights-entry-points',
      ]);
      expect(await screen.findByTestId('sidebar-dropdown')).toBeInTheDocument();
      const sidebarItems = container.querySelectorAll('[id^="sidebar-item"]');
      const sidebarItemIds = Array.from(sidebarItems).map(sidebarItem => sidebarItem.id);
      expect(sidebarItems.length).toEqual(21);
      expect(sidebarItemIds).toEqual([
        'sidebar-item-issues',
        'sidebar-item-projects',
        'sidebar-item-sidebar-accordion-explore-item',
        'sidebar-item-sidebar-accordion-insights-item',
        'sidebar-item-performance-http',
        'sidebar-item-performance-database',
        'sidebar-item-performance-browser-resources',
        'sidebar-item-performance-mobile-app-startup',
        'sidebar-item-performance-mobile-screens',
        'sidebar-item-performance-webvitals',
        'sidebar-item-performance-cache',
        'sidebar-item-performance',
        'sidebar-item-crons',
        'sidebar-item-alerts',
        'sidebar-item-releases',
        'sidebar-item-stats',
        'sidebar-item-settings',
        'sidebar-item-help',
        'sidebar-item-broadcasts',
        'sidebar-item-statusupdate',
        'sidebar-item-collapse',
      ]);
    });

    it('renders sidebar items for self-hosted errors only', async function () {
      act(() => void ConfigStore.set('isSelfHostedErrorsOnly', true));
      const {container} = renderSidebarWithFeatures();
      expect(await screen.findByTestId('sidebar-dropdown')).toBeInTheDocument();
      const sidebarItems = container.querySelectorAll('[id^="sidebar-item"]');
      const sidebarItemIds = Array.from(sidebarItems).map(sidebarItem => sidebarItem.id);
      expect(sidebarItems.length).toEqual(10);
      expect(sidebarItemIds).toEqual([
        'sidebar-item-issues',
        'sidebar-item-projects',
        'sidebar-item-alerts',
        'sidebar-item-releases',
        'sidebar-item-stats',
        'sidebar-item-settings',
        'sidebar-item-help',
        'sidebar-item-broadcasts',
        'sidebar-item-statusupdate',
        'sidebar-item-collapse',
      ]);
      act(() => void ConfigStore.set('isSelfHostedErrorsOnly', false));
    });

    it('should not render floating accordion when expanded', async () => {
      renderSidebarWithFeatures();
      await userEvent.click(screen.getByTestId('sidebar-accordion-performance-item'));
      expect(screen.queryByTestId('floating-accordion')).not.toBeInTheDocument();
    });

    it('should render floating accordion when collapsed', async () => {
      renderSidebarWithFeatures();
      await userEvent.click(screen.getByTestId('sidebar-collapse'));
      await userEvent.click(screen.getByTestId('sidebar-accordion-performance-item'));
      expect(await screen.findByTestId('floating-accordion')).toBeInTheDocument();
    });
  });
});
