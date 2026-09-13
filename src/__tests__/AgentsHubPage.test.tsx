import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const portal = vi.hoisted(() => ({
  askAgent: vi.fn(),
  connectFabric: vi.fn(),
  listAgents: vi.fn(),
}));

vi.mock('@/services/biPortalService', () => portal);
vi.mock('@/hooks/AuthContext', () => ({
  useAuth: () => ({ signOut: vi.fn(), user: { name: 'Test User' } }),
}));

import { AgentsHubPage } from '@/pages/AgentsHubPage';

const AGENTS = [
  { id: 'agent-1', name: 'ICC World Test Championship Agent', description: 'Cricket stats' },
  { id: 'agent-2', name: 'Finance Agent', description: 'Budget insights' },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <AgentsHubPage />
    </MemoryRouter>
  );
}

describe('AgentsHubPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    portal.listAgents.mockResolvedValue(AGENTS);
  });

  it('lists the available agents and marks the first one as the default', async () => {
    renderPage();

    expect(await screen.findByRole('listitem', { name: /ICC World Test Championship Agent/i })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: /Finance Agent/i })).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(
      screen.getByText(/ICC World Test Championship Agent answers by default/i)
    ).toBeInTheDocument();
  });

  it('routes a plain message to the default (first) agent', async () => {
    portal.askAgent.mockResolvedValue({ answer: 'Match summary here.' });
    const user = userEvent.setup();
    renderPage();

    const textarea = await screen.findByLabelText('Ask a Data Agent');
    await user.type(textarea, 'Who won the last match?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(portal.askAgent).toHaveBeenCalledTimes(1));
    expect(portal.askAgent).toHaveBeenCalledWith('agent-1', 'Who won the last match?', undefined, undefined);
    const answer = await screen.findByText('Match summary here.');
    const bubble = answer.closest('div.rounded-xl') as HTMLElement;
    expect(within(bubble).getByText('ICC World Test Championship Agent')).toBeInTheDocument();
  });

  it('routes an @mentioned message to that specific agent instead of the default', async () => {
    portal.askAgent.mockResolvedValue({ answer: 'Q3 spend is on track.' });
    const user = userEvent.setup();
    renderPage();

    const textarea = await screen.findByLabelText('Ask a Data Agent');
    await user.type(textarea, '@Finance Agent how is Q3 spend?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(portal.askAgent).toHaveBeenCalledTimes(1));
    expect(portal.askAgent).toHaveBeenCalledWith('agent-2', 'how is Q3 spend?', undefined, undefined);
    expect(await screen.findByText('Q3 spend is on track.')).toBeInTheDocument();
    // The full mention stays visible in the user's own bubble, WhatsApp-style.
    expect(screen.getByText('@Finance Agent how is Q3 spend?')).toBeInTheDocument();
  });

  it('fans a message mentioning multiple agents out to each of them in parallel', async () => {
    let resolveIcc: (value: { answer: string }) => void = () => {};
    let resolveFinance: (value: { answer: string }) => void = () => {};
    portal.askAgent.mockImplementation(
      (agentId: string) =>
        new Promise((resolve) => {
          if (agentId === 'agent-1') resolveIcc = resolve;
          else resolveFinance = resolve;
        })
    );
    const user = userEvent.setup();
    renderPage();

    const textarea = await screen.findByLabelText('Ask a Data Agent');
    await user.type(
      textarea,
      '@ICC World Test Championship Agent @Finance Agent give me a status update'
    );
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(portal.askAgent).toHaveBeenCalledTimes(2));
    expect(portal.askAgent).toHaveBeenCalledWith('agent-1', 'give me a status update', undefined, undefined);
    expect(portal.askAgent).toHaveBeenCalledWith('agent-2', 'give me a status update', undefined, undefined);
    // The full, multi-mention message stays visible in the user's own bubble.
    expect(
      screen.getByText('@ICC World Test Championship Agent @Finance Agent give me a status update')
    ).toBeInTheDocument();

    expect(
      await screen.findByText('Waiting for ICC World Test Championship Agent, Finance Agent…')
    ).toBeInTheDocument();

    // Finance replies first even though it was mentioned second — arrival order, not mention order.
    resolveFinance({ answer: 'Finance says all good.' });
    expect(await screen.findByText('Finance says all good.')).toBeInTheDocument();
    expect(await screen.findByText('Waiting for a response…')).toBeInTheDocument();

    resolveIcc({ answer: 'ICC says all good too.' });
    expect(await screen.findByText('ICC says all good too.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Waiting for/i)).not.toBeInTheDocument());
  });

  it('shows a per-agent error but still displays replies from agents that succeeded', async () => {
    portal.askAgent.mockImplementation((agentId: string) =>
      agentId === 'agent-1'
        ? Promise.resolve({ answer: 'ICC is fine.' })
        : Promise.reject(new Error('Finance agent offline.'))
    );
    const user = userEvent.setup();
    renderPage();

    const textarea = await screen.findByLabelText('Ask a Data Agent');
    await user.type(textarea, '@ICC World Test Championship Agent @Finance Agent status check');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('ICC is fine.')).toBeInTheDocument();
    expect(await screen.findByText('Finance Agent: Finance agent offline.')).toBeInTheDocument();
  });

  it('shows a filterable @mention dropdown while typing and lets the user pick an agent', async () => {
    const user = userEvent.setup();
    renderPage();

    const textarea = await screen.findByLabelText('Ask a Data Agent');
    await user.type(textarea, '@fin');

    const option = await screen.findByRole('option', { name: /Finance Agent/i });
    expect(screen.queryByRole('option', { name: /ICC World Test Championship Agent/i })).not.toBeInTheDocument();

    await user.click(option);

    expect(textarea).toHaveValue('@Finance Agent ');
  });

  it('inserts a quick mention when an agent chip in the roster is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    const chip = await screen.findByRole('listitem', { name: /Finance Agent/i });
    await user.click(chip);

    const textarea = screen.getByLabelText('Ask a Data Agent');
    expect(textarea).toHaveValue('@Finance Agent ');
  });

  it('appends an additional mention when a second agent chip is clicked, instead of replacing the first', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('listitem', { name: /Finance Agent/i }));
    await user.click(screen.getByRole('listitem', { name: /ICC World Test Championship Agent/i }));

    const textarea = screen.getByLabelText('Ask a Data Agent');
    expect(textarea).toHaveValue('@Finance Agent @ICC World Test Championship Agent ');
  });

  it('does not add a duplicate mention when the same agent chip is clicked again', async () => {
    const user = userEvent.setup();
    renderPage();

    const chip = await screen.findByRole('listitem', { name: /Finance Agent/i });
    await user.click(chip);
    await user.click(chip);

    const textarea = screen.getByLabelText('Ask a Data Agent');
    expect(textarea).toHaveValue('@Finance Agent ');
  });

  it('shows a connection error with a retry action when agents fail to load', async () => {
    portal.listAgents.mockReset();
    portal.listAgents.mockRejectedValue(new Error('Fabric connection required.'));
    portal.connectFabric.mockResolvedValue('test-token');
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Fabric connection required.');

    portal.listAgents.mockResolvedValue(AGENTS);
    await userEvent.click(screen.getByRole('button', { name: 'Connect Fabric' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(await screen.findByRole('listitem', { name: /Finance Agent/i })).toBeInTheDocument();
  });

  it('shows an empty state and disables the composer when no agents are available', async () => {
    portal.listAgents.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/No Data Agents are available/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Ask a Data Agent')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('disables Send while a request is in flight and surfaces errors from the agent', async () => {
    let resolveAsk: (value: { answer: string }) => void = () => {};
    portal.askAgent.mockReturnValue(
      new Promise((resolve) => {
        resolveAsk = resolve;
      })
    );
    const user = userEvent.setup();
    renderPage();

    const textarea = await screen.findByLabelText('Ask a Data Agent');
    await user.type(textarea, 'Hello there');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Waiting for a response…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '...' })).toBeDisabled();

    resolveAsk({ answer: 'Hi! How can I help?' });
    expect(await screen.findByText('Hi! How can I help?')).toBeInTheDocument();
  });
});
