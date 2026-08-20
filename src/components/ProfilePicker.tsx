import { useState } from 'react';
import { ToolIcon } from '../icons';
import type { CloudStatus } from '../cloud';
import { PROFILE_AVATARS, type Profile, type StorageKind } from '../storage';

export function ProfilePicker({
  profiles,
  activeProfileId,
  houseCode,
  houseShareUrl,
  cloudStatus,
  storageKind,
  onSelect,
  onCreate,
  onDelete,
  onJoinHouse,
}: {
  profiles: Profile[];
  activeProfileId: string | null;
  houseCode: string;
  houseShareUrl: string;
  cloudStatus: CloudStatus;
  storageKind: StorageKind;
  onSelect: (profile: Profile) => void;
  onCreate: (input: { name: string; color: string; emoji: string }) => void;
  onDelete: (profile: Profile) => void;
  onJoinHouse: (code: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(profiles.length === 0);
  const [name, setName] = useState('');
  const [avatarIndex, setAvatarIndex] = useState(profiles.length % PROFILE_AVATARS.length);
  const avatar = PROFILE_AVATARS[avatarIndex] ?? PROFILE_AVATARS[0];

  const submit = () => {
    const trimmed = name.trim().slice(0, 18);
    if (!trimmed) return;
    onCreate({ name: trimmed, color: avatar.color, emoji: avatar.emoji });
    setName('');
    setCreating(false);
  };

  return <div className="start-chooser profile-gate" role="dialog" aria-modal="true" aria-labelledby="profile-gate-title">
    <div className="start-chooser__panel">
      {creating ? <>
        <header className="start-chooser__header">
          <span className="brand__mark" aria-hidden="true">✦</span>
          <div>
            <span className="eyebrow">New artist</span>
            <h1 id="profile-gate-title">{profiles.length ? 'Add a friend' : 'Who is drawing?'}</h1>
          </div>
        </header>
        <form className="profile-create" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <label className="profile-create__name">
            <span>Name</span>
            <input
              autoFocus
              maxLength={18}
              placeholder="Type a name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <p className="profile-create__label">Pick a picture</p>
          <div className="profile-avatar-grid" role="listbox" aria-label="Avatar">
            {PROFILE_AVATARS.map((item, index) => <button
              key={`${item.emoji}-${item.color}`}
              type="button"
              role="option"
              aria-selected={index === avatarIndex}
              className={`profile-avatar${index === avatarIndex ? ' is-selected' : ''}`}
              style={{ background: item.color }}
              onClick={() => setAvatarIndex(index)}
            >{item.emoji}</button>)}
          </div>
          <div className="profile-create__actions">
            {profiles.length > 0 && <button type="button" className="profile-secondary" onClick={() => setCreating(false)}>Back</button>}
            <button type="submit" className="profile-primary" disabled={!name.trim()}>Let’s draw</button>
          </div>
        </form>
      </> : <>
        <header className="start-chooser__header">
          <span className="brand__mark" aria-hidden="true">✦</span>
          <div>
            <span className="eyebrow">Color Pop</span>
            <h1 id="profile-gate-title">Who’s drawing?</h1>
          </div>
        </header>
        <div className="profile-grid">
          {profiles.map((profile) => <div key={profile.id} className={`profile-card${profile.id === activeProfileId ? ' is-active' : ''}`}>
            <button type="button" className="profile-card__pick" onClick={() => onSelect(profile)}>
              <span className="profile-avatar profile-avatar--large" style={{ background: profile.color }}>{profile.emoji}</span>
              <b>{profile.name}</b>
              <small>{profile.id === activeProfileId ? 'Drawing now' : 'Tap to draw'}</small>
            </button>
            <button
              type="button"
              className="profile-card__delete"
              aria-label={`Delete ${profile.name}`}
              onClick={() => {
                if (window.confirm(`Delete ${profile.name} and their drawings?`)) onDelete(profile);
              }}
            ><ToolIcon name="close" size={16} /></button>
          </div>)}
          <button type="button" className="profile-card profile-card--add" onClick={() => { setCreating(true); setName(''); }}>
            <span className="profile-avatar profile-avatar--large profile-avatar--add"><ToolIcon name="plus" size={28} /></span>
            <b>Add artist</b>
            <small>Make a new profile</small>
          </button>
        </div>
      </>}
      <FamilyCloudCard
        houseCode={houseCode}
        houseShareUrl={houseShareUrl}
        cloudStatus={cloudStatus}
        storageKind={storageKind}
        onJoinHouse={onJoinHouse}
      />
    </div>
  </div>;
}

function FamilyCloudCard({
  houseCode,
  houseShareUrl,
  cloudStatus,
  storageKind,
  onJoinHouse,
}: {
  houseCode: string;
  houseShareUrl: string;
  cloudStatus: CloudStatus;
  storageKind: StorageKind;
  onJoinHouse: (code: string) => Promise<void>;
}) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [busy, setBusy] = useState(false);

  const markCopied = (kind: 'code' | 'link') => {
    setCopied(kind);
    window.setTimeout(() => setCopied((current) => current === kind ? null : current), 1600);
  };

  const copy = async (value: string, kind: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(value);
      markCopied(kind);
    } catch {
      window.prompt(kind === 'code' ? 'Copy this family code' : 'Copy this family link', value);
    }
  };

  const join = async () => {
    setJoinError('');
    setBusy(true);
    try {
      await onJoinHouse(joinCode);
      setJoining(false);
      setJoinCode('');
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Could not open that family.');
    } finally {
      setBusy(false);
    }
  };

  const status = cloudStatus === 'online'
    ? 'Artists and drawings are saved in the family cloud. Open this same link in a private window to find them.'
    : storageKind === 'memory'
      ? 'This private window can’t remember by itself. Bookmark the family link after the cloud is connected.'
      : 'Drawings stay on this device for now. A private window will find them once the family cloud is connected.';

  return <section className="profile-house" aria-label="Family cloud">
    <div className="profile-house__row">
      <div>
        <p className="profile-house__label">Family code</p>
        <p className="profile-house__code">{houseCode || '••••-••••'}</p>
      </div>
      <span className={`profile-house__pill is-${cloudStatus}`}>{cloudStatus === 'online' ? 'Cloud on' : cloudStatus === 'checking' ? 'Looking…' : 'Cloud off'}</span>
    </div>
    <p className="profile-house__status">{cloudStatus === 'checking' ? 'Looking for your family drawings…' : status}</p>
    <div className="profile-house__actions">
      <button type="button" className="profile-secondary" onClick={() => void copy(houseCode, 'code')}>{copied === 'code' ? 'Copied code' : 'Copy code'}</button>
      <button type="button" className="profile-secondary" onClick={() => void copy(houseShareUrl, 'link')}>{copied === 'link' ? 'Copied link' : 'Copy link'}</button>
      <button type="button" className="profile-secondary" onClick={() => { setJoining((value) => !value); setJoinError(''); }}>{joining ? 'Cancel' : 'Use a different code'}</button>
    </div>
    {joining && <form className="profile-house__join" onSubmit={(event) => { event.preventDefault(); void join(); }}>
      <label className="profile-create__name">
        <span>Family code</span>
        <input
          autoFocus
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="ABCD-EFGH"
          value={joinCode}
          onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
        />
      </label>
      {joinError && <p className="profile-house__error">{joinError}</p>}
      <button type="submit" className="profile-primary" disabled={busy || joinCode.trim().length < 8}>{busy ? 'Opening…' : 'Open family'}</button>
    </form>}
  </section>;
}
