-- Every hook on a shoot is used for every channel ("shared" allocation); hooks are no longer split per channel.
alter table public.shoots alter column hook_allocation set default 'shared';
update public.shoots set hook_allocation = 'shared' where hook_allocation <> 'shared';
update public.shoot_items set channel_id = null where kind = 'hook' and channel_id is not null;
