create policy "Autenticados enviam anexos"
on storage.objects for insert to authenticated
with check (bucket_id = 'anexos');

create policy "Autenticados leem anexos"
on storage.objects for select to authenticated
using (bucket_id = 'anexos');

create policy "Autenticados apagam anexos"
on storage.objects for delete to authenticated
using (bucket_id = 'anexos');