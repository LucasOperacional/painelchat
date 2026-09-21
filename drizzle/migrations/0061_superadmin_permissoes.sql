-- superadmin herda todas as permissões (inclusive admin)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = _role OR role = 'superadmin'::public.app_role)
  )
$$;

-- concede superadmin ao usuário lucasdallan
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'superadmin'::public.app_role
FROM public.profiles p
WHERE p.username = 'lucasdallan'
ON CONFLICT (user_id, role) DO NOTHING;
