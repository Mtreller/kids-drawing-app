import { useState } from 'react';
import { ToolIcon } from '../icons';
import { PROFILE_AVATARS, type Profile } from '../storage';

export function ProfilePicker({
  profiles,
  activeProfileId,
  onSelect,
  onCreate,
  onDelete,
}: {
  profiles: Profile[];
  activeProfileId: string | null;
  onSelect: (profile: Profile) => void;
  onCreate: (input: { name: string; color: string; emoji: string }) => void;
  onDelete: (profile: Profile) => void;
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
    </div>
  </div>;
}
