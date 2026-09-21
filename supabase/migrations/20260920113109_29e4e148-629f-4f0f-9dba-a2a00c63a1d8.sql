update public.whatsapp_config
set status = 'connecting',
    last_event = 'qr',
    instance_id = '1',
    webhook_url = 'https://project--97ffdf59-274d-422b-93c2-4b8e8cb52bb4-dev.lovable.app/api/public/evolution?token=' || coalesce(webhook_token,''),
    webhook_synced_at = now(),
    updated_at = now()
where id = '82b90800-c093-40ae-9386-76be730a8171';