{
  description = "Klopf Card Game";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          go
          gopls
          nodejs_22
          nodePackages.pnpm
        ];

        shellHook = ''
          echo "Klopf Game Dev Environment"
          echo "Go: $(go version)"
          echo "Node: $(node --version)"
          echo ""
          echo "Backend: cd backend && go run cmd/server/main.go"
          echo "Frontend: cd frontend && pnpm start"
        '';
      };
    };
}
