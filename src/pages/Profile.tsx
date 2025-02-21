import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "../integrations/supabase/client";
import { Button } from "../components/ui/button";
import { useToast } from "../hooks/use-toast";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Settings, MapPin, Link2, Eye, ArrowLeft } from "lucide-react";
import BottomNav from "../components/BottomNav";
import { useTheme } from "../components/ThemeProvider";
import ProfileTabs from "../components/ProfileTabs";
import EditProfileDialog from "../components/EditProfileDialog";
import EditPhotosButton from "../components/EditPhotosButton";
import type { Profile } from "../types/profile";

const defaultAvatarImage = "/placeholder.svg";
const defaultCoverImage = "/placeholder.svg";

export default function Profile() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const { theme } = useTheme();

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: "",
      email: "",
      phone: "",
      birth_date: "",
      street: "",
      house_number: "",
      city: "",
      postal_code: "",
      avatar_url: "",
      cover_url: "",
      username: "",
      bio: "",
      website: "",
      status: "",
    },
  });

  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (error) throw error;
      
      if (data) {
        if (data.avatar_url) {
          data.avatar_url = convertDropboxUrl(data.avatar_url);
        }
        if (data.cover_url) {
          data.cover_url = convertDropboxUrl(data.cover_url);
        }
      }
      
      return data;
    },
  });

  const { data: userProducts } = useQuery({
    queryKey: ["userProducts"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];

      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("user_id", session.user.id);

      return data || [];
    },
  });

  const { data: locations } = useQuery({
    queryKey: ["locations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("locations")
        .select("*")
        .order("name");
      return data || [];
    },
  });

  const handleDeleteAvatar = async () => {
    form.setValue("avatar_url", null);
    updateProfile.mutate(form.getValues());
    setShowDeletePhotoDialog(false);
    toast({
      title: "Foto de perfil removida",
      description: "Sua foto de perfil foi removida com sucesso",
    });
  };

  const handleDeleteCover = async () => {
    form.setValue("cover_url", null);
    updateProfile.mutate(form.getValues());
    setShowDeleteCoverDialog(false);
    toast({
      title: "Foto de capa removida",
      description: "Sua foto de capa foi removida com sucesso",
    });
  };

  const handleCoverImageClick = () => {
    const dialog = window.prompt('Cole aqui o link do Dropbox para a imagem de capa:', profile?.cover_url || '');
    if (dialog !== null) {
      const values = {
        ...form.getValues(),
        cover_url: dialog
      };
      updateProfile.mutate(values);
    }
  };

  const handleAvatarImageClick = () => {
    const dialog = window.prompt('Cole aqui o link do Dropbox para a foto de perfil:', profile?.avatar_url || '');
    if (dialog !== null) {
      form.setValue("avatar_url", dialog);
      updateProfile.mutate(form.getValues());
    }
  };

  const handleImageError = (error: any) => {
    console.error("Erro ao carregar a imagem", error);
    toast({
      title: "Erro ao carregar a imagem",
      description: "Verifique se o link do Dropbox está correto",
      variant: "destructive",
    });
    setIsLoadingImage(false);
  };

  const copyProfileLink = () => {
    if (profile?.username) {
      navigator.clipboard.writeText(`${window.location.origin}/perfil/${profile.username}`);
      toast({
        title: "Link copiado!",
        description: "O link do seu perfil foi copiado para a área de transferência.",
      });
    }
  };

  const updateProfile = useMutation({
    mutationFn: async (values: z.infer<typeof profileSchema>) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      if (values.avatar_url) {
        values.avatar_url = convertDropboxUrl(values.avatar_url);
      }
      if (values.cover_url) {
        values.cover_url = convertDropboxUrl(values.cover_url);
      }

      const isUpdatingRestricted = 
        values.username !== profile?.username ||
        values.phone !== profile?.phone;

      if (isUpdatingRestricted) {
        const { data: canUpdate, error: checkError } = await supabase
          .rpc('can_update_basic_info', { profile_id: session.user.id });

        if (checkError) throw checkError;
        if (!canUpdate) {
          throw new Error("Você só pode alterar seu @ ou telefone após 30 dias da última atualização.");
        }

        values.basic_info_updated_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("profiles")
        .update(values)
        .eq("id", session.user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast({
        title: "Perfil atualizado",
        description: "Suas informações foram atualizadas com sucesso",
      });
      setShowSettings(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar perfil",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (values: any) => {
    await updateProfile.mutateAsync(values);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  useEffect(() => {
    if (profile) {
      form.reset({
        full_name: profile.full_name || "",
        email: profile.email || "",
        phone: profile.phone || "",
        birth_date: profile.birth_date ? format(new Date(profile.birth_date), "yyyy-MM-dd") : "",
        street: profile.street || "",
        house_number: profile.house_number || "",
        city: profile.city || "",
        postal_code: profile.postal_code || "",
        avatar_url: profile.avatar_url || "",
        cover_url: profile.cover_url || "",
        username: profile.username || "",
        bio: profile.bio || "",
        website: profile.website || "",
        status: profile.status || "",
      });
    }
  }, [profile, form]);

  if (isProfileLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white">
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${theme === 'light' ? 'bg-white text-black' : 'bg-black text-white'}`}>
      <div className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between p-4 ${theme === 'light' ? 'bg-white/90' : 'bg-black/90'} backdrop-blur`}>
        <div className="flex items-center">
          <button onClick={() => navigate(-1)} className="mr-2">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h1 className="text-lg font-semibold">{profile?.full_name}</h1>
        </div>
        <button onClick={handleLogout} className="flex items-center">
          <LogOut className="h-6 w-6" />
        </button>
      </div>

      <div className="pt-16 pb-20">
        <div className="relative">
          <div className="h-32 bg-gray-200 dark:bg-gray-800 relative">
            {profile?.cover_url ? (
              <img
                src={profile.cover_url}
                alt="Capa"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = defaultCoverImage;
                }}
              />
            ) : (
              <div className={`w-full h-full flex items-center justify-center ${theme === 'light' ? 'bg-white' : 'bg-black'}`}>
                <p className="text-gray-500">Sem Capa de Perfil</p>
              </div>
            )}
          </div>

          <div className="relative -mt-16 px-4">
            <div className="relative inline-block">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white dark:border-black">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = defaultAvatarImage;
                    }}
                  />
                ) : (
                  <div className={`w-full h-full flex items-center justify-center ${theme === 'light' ? 'bg-white' : 'bg-black'}`}>
                    <p className="text-gray-500">Sem foto de perfil</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="px-4 mt-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold">{profile?.full_name}</h2>
                <p className="text-gray-400">@{profile?.username}</p>
                {profile?.status && (
                  <p className="text-yellow-500 text-sm mt-1">
                    {profile.status} 👍
                  </p>
                )}
                {profile?.city && (
                  <p className="text-gray-400 text-sm mt-1 flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    Mora em {profile.city}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {!isPreviewMode ? (
                  <>
                    <EditPhotosButton 
                      onAvatarClick={handleAvatarImageClick} 
                      onCoverClick={handleCoverImageClick}
                    />

                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" className={`${theme === 'light' ? 'text-black border-gray-300' : 'text-white border-gray-700'}`}>
                          Editar perfil
                        </Button>
                      </DialogTrigger>
                      <EditProfileDialog profile={profile} onSubmit={handleSubmit} />
                    </Dialog>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="border-gray-700">
                          <Settings className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-gray-900 border-gray-800">
                        <DropdownMenuItem onClick={copyProfileLink} className="text-white cursor-pointer">
                          <Link2 className="h-4 w-4 mr-2" />
                          Copiar link do perfil
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setIsPreviewMode(true)} className="text-white cursor-pointer">
                          <Eye className="h-4 w-4 mr-2" />
                          Ver como
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                ) : (
                  <Button 
                    onClick={() => setIsPreviewMode(false)} 
                    variant="outline" 
                    className={`${theme === 'light' ? 'text-black border-gray-300' : 'text-white border-gray-700'}`}
                  >
                    Sair do modo preview
                  </Button>
                )}
              </div>
            </div>

            <ProfileTabs userProducts={userProducts} />
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
